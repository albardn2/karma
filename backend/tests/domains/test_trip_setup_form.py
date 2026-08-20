"""The revamped setup form's contract, and the bridge to the old one.

The 2026-08 form is six fields with `strategy` in place of the manual_stops
toggle. Two things here are load-bearing enough to pin:

  1. THE BRIDGE. Executions started under the OLD form are still in flight, and
     every operator reads their stored results through resolve_strategy. An old
     ROUTED result must keep resolving to the legacy pipeline (it is the only
     path that can read its stored inputs) — a careless default of "manual"
     would silently strand it with zero routed stops.

  2. THE VALIDATION. The schema is extra=forbid and the old clients' bundles
     briefly outlive a deploy, so the exact failure shape of an old-form
     submission matters; and the date window is what keeps "assigned date"
     meaning something — yesterday must not be schedulable.
"""
from datetime import datetime, timedelta

import pytest

from app.domains.task_execution.workflow_operators.start_trip_operator import (
    ASSIGNED_DATE_WINDOW_DAYS,
    StartTripOperatorSchema,
    assigned_date_options,
)
from app.domains.task_execution.workflow_operators.trip_setup import (
    LEGACY_CLUSTER,
    MANUAL,
    resolve_strategy,
)
from app.entrypoint.routes.common.errors import BadRequestError


def _damascus_today():
    return (datetime.utcnow() + timedelta(hours=3)).date()


def _valid(**over):
    base = {
        "service_areas": ["malki"],
        "assigned_user_uuid": "drv_test",
        "assigned_date": _damascus_today().strftime("%d-%m-%Y"),
        "desired_stops": 12,
        "strategy": "manual",
        "vehicle_plate": "TRIP-1",
    }
    base.update(over)
    return base


# --- the bridge -------------------------------------------------------------

def test_new_form_resolves_its_strategy():
    assert resolve_strategy({"strategy": "manual"}) == MANUAL


def test_single_pick_list_resolves():
    """The checklist widget submits one-element lists."""
    assert resolve_strategy({"strategy": ["manual"]}) == MANUAL


def test_old_manual_result_stays_manual():
    assert resolve_strategy({"manual_stops": True, "vehicle_plate": "x"}) == MANUAL


def test_old_routed_result_goes_to_the_legacy_pipeline():
    """The one that must never break: an old routed execution's stored inputs
    (warehouses, threshold, max/min) are only readable by the legacy path."""
    assert resolve_strategy({"manual_stops": False, "start_warehouse_name": "hosh blas"}) == LEGACY_CLUSTER


def test_prehistoric_result_defaults_to_manual():
    """Neither key present: only the manual path can serve it."""
    assert resolve_strategy({}) == MANUAL
    assert resolve_strategy(None) == MANUAL


# --- the date window --------------------------------------------------------

def test_options_are_the_rolling_window_starting_today():
    opts = assigned_date_options()
    assert len(opts) == ASSIGNED_DATE_WINDOW_DAYS + 1
    assert opts[0] == _damascus_today().strftime("%d-%m-%Y")
    # dd-mm-yyyy shape, every one
    for o in opts:
        datetime.strptime(o, "%d-%m-%Y")


def test_every_offered_date_validates():
    """The options and the validator must agree, or the form offers a date the
    submit then rejects."""
    for o in assigned_date_options():
        assert StartTripOperatorSchema(**_valid(assigned_date=o)).assigned_date == o


def test_yesterday_is_not_schedulable():
    y = (_damascus_today() - timedelta(days=1)).strftime("%d-%m-%Y")
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(assigned_date=y))


def test_beyond_the_window_is_not_schedulable():
    far = (_damascus_today() + timedelta(days=ASSIGNED_DATE_WINDOW_DAYS + 1)).strftime("%d-%m-%Y")
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(assigned_date=far))


def test_wrong_date_shape_is_rejected():
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(assigned_date="2026-08-20"))  # ISO, not dd-mm-yyyy


def test_single_pick_date_list_unwraps():
    today = _damascus_today().strftime("%d-%m-%Y")
    assert StartTripOperatorSchema(**_valid(assigned_date=[today])).assigned_date == today


def test_two_picked_dates_are_rejected():
    opts = assigned_date_options()
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(assigned_date=[opts[0], opts[1]]))


# --- strategy and the rest ---------------------------------------------------

def test_strategy_defaults_to_manual():
    payload = _valid()
    payload.pop("strategy")
    assert StartTripOperatorSchema(**payload).strategy == MANUAL


def test_unknown_strategy_is_rejected():
    """The dropdown only offers registered strategies, so anything else is an
    API caller guessing — refused, not silently run as manual."""
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(strategy="teleport"))


def test_desired_stops_bounds():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        StartTripOperatorSchema(**_valid(desired_stops=0))
    with pytest.raises(ValidationError):
        StartTripOperatorSchema(**_valid(desired_stops=201))


def test_assigned_user_and_vehicle_are_required():
    from pydantic import ValidationError
    for missing in ("assigned_user_uuid", "vehicle_plate", "assigned_date"):
        payload = _valid()
        payload.pop(missing)
        with pytest.raises(ValidationError):
            StartTripOperatorSchema(**payload)


def test_old_form_fields_are_refused_loudly():
    """extra=forbid: a stale client posting the old shape gets a validation
    error naming the field, not a trip configured with silently dropped inputs."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        StartTripOperatorSchema(**_valid(manual_stops=True))
    with pytest.raises(ValidationError):
        StartTripOperatorSchema(**_valid(max_stops=20))
