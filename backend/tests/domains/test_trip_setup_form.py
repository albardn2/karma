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
     meaning something — with one day of grace at the lower bound for the
     form-read-before-midnight / submit-after race.
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


def test_custom_strategy_names_keep_their_stored_casing():
    """Built-ins fold to lowercase; saved names pass through untouched —
    Python str.lower() disagrees with SQL lower() on some non-ASCII case
    pairs, so the CI lookup (find_by_name_ci) is the only folding authority."""
    assert resolve_strategy({"strategy": "VIP First"}) == "VIP First"
    assert resolve_strategy({"strategy": "MANUAL"}) == MANUAL


def test_old_manual_result_stays_manual():
    assert resolve_strategy({"manual_stops": True, "vehicle_plate": "x"}) == MANUAL


def test_old_routed_result_goes_to_the_legacy_pipeline():
    """The one that must never break: an old routed execution's stored inputs
    (warehouses, threshold, max/min) are only readable by the legacy path."""
    assert resolve_strategy({"manual_stops": False, "start_warehouse_name": "hosh blas"}) == LEGACY_CLUSTER


def test_prehistoric_routed_result_goes_to_the_legacy_pipeline():
    """Executions from before the manual_stops toggle existed (pre-2026-07)
    have NEITHER key — but that schema required the routing inputs, so the
    result carries the routed signature and was routed under the old code.
    Defaulting it to manual would silently convert a routed trip in flight
    into an empty manual one."""
    assert resolve_strategy({
        "service_areas": ["malki"],
        "start_warehouse_name": "hosh blas",
        "end_warehouse_name": "hosh blas",
        "last_visit_threshold_days": 14,
    }) == LEGACY_CLUSTER


def test_a_result_bare_of_both_generations_defaults_to_manual():
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


def test_yesterday_gets_the_midnight_grace():
    """The option list is generated at form-READ time, so 'today' picked just
    before Damascus midnight arrives as yesterday when submitted just after.
    One day of grace on the lower bound absorbs the race."""
    y = (_damascus_today() - timedelta(days=1)).strftime("%d-%m-%Y")
    assert StartTripOperatorSchema(**_valid(assigned_date=y)).assigned_date == y


def test_two_days_ago_is_not_schedulable():
    stale = (_damascus_today() - timedelta(days=2)).strftime("%d-%m-%Y")
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(assigned_date=stale))


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


def test_blank_strategy_means_the_default():
    """The web posts every field, so an untouched select (whose placeholder
    reads 'manual') arrives as '' — present-but-blank must behave like absent,
    or the placeholder promises a default nobody applies."""
    assert StartTripOperatorSchema(**_valid(strategy="")).strategy == MANUAL
    assert StartTripOperatorSchema(**_valid(strategy="  ")).strategy == MANUAL
    assert StartTripOperatorSchema(**_valid(strategy=[])).strategy == MANUAL


def test_blank_assignee_or_vehicle_is_rejected():
    """Plain `str` accepts '' — and a blank assignee would silently skip both
    the existence check and the one-trip guard in execute()."""
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(assigned_user_uuid=""))
    with pytest.raises(BadRequestError):
        StartTripOperatorSchema(**_valid(vehicle_plate="   "))


def test_builtin_strategy_is_lowercased_custom_names_keep_their_casing():
    """Built-ins match case-insensitively; anything else is a saved strategy
    NAME, kept as typed — execute() verifies it against the DB (a pure schema
    can't query)."""
    assert StartTripOperatorSchema(**_valid(strategy="MANUAL")).strategy == MANUAL
    assert StartTripOperatorSchema(**_valid(strategy="VIP First")).strategy == "VIP First"


def _execute_setup(payload_result, strategy_row):
    from unittest.mock import MagicMock

    from app.domains.task_execution.workflow_operators.start_trip_operator import (
        StartTripOperator,
    )
    from app.dto.task_execution import TaskExecutionComplete

    task_exe = MagicMock()
    task_exe.result = None
    task_exe.workflow_execution.trips = []
    uow = MagicMock()
    uow.task_execution_repository.find_one.return_value = task_exe
    uow.routing_strategy_repository.find_by_name_ci.return_value = strategy_row
    uow.session.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = None
    StartTripOperator().execute(
        uow=uow,
        payload=TaskExecutionComplete(uuid="te-1", result=payload_result, completed_by_uuid="x"),
    )
    return task_exe


def test_unknown_strategy_is_rejected_at_setup():
    """The dropdown only offers built-ins plus saved strategies, so anything
    else is an API caller guessing — refused while the dispatcher is still at
    the form, not when the route step blows up later."""
    with pytest.raises(BadRequestError):
        _execute_setup(_valid(strategy="teleport"), strategy_row=None)


def test_saved_strategy_requires_desired_stops():
    from unittest.mock import MagicMock

    row = MagicMock()
    row.name = "vip first"
    payload = _valid(strategy="vip first")
    payload.pop("desired_stops")
    with pytest.raises(BadRequestError):
        _execute_setup(payload, strategy_row=row)


def test_saved_strategy_is_stored_under_its_canonical_casing():
    from unittest.mock import MagicMock

    row = MagicMock()
    row.name = "VIP First"
    task_exe = _execute_setup(_valid(strategy="vip first"), strategy_row=row)
    assert task_exe.result["strategy"] == "VIP First"


def test_blank_desired_stops_means_absent():
    assert StartTripOperatorSchema(**_valid(desired_stops="")).desired_stops is None
    assert StartTripOperatorSchema(**_valid(desired_stops=None)).desired_stops is None


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


def test_a_recompleted_setup_renames_the_derived_trip():
    """The engine allows re-completing a completed task, so setup can be
    re-submitted after the trip exists (switch the driver, move the date) —
    while the trip is still PLANNED; once started, driver and day are frozen.
    The trip's name is derived from exactly those inputs: a trip still
    carrying the old derived name must follow the restamp — but a name someone
    set by hand stays theirs."""
    from unittest.mock import MagicMock

    from app.domains.task_execution.workflow_operators.start_trip_operator import (
        StartTripOperator,
        trip_name_for,
    )
    from app.dto.task_execution import TaskExecutionComplete

    today = _damascus_today().strftime("%d-%m-%Y")
    old_name = trip_name_for("drv_a", today)

    from app.dto.trip import TripStatus

    derived_trip = MagicMock(
        is_deleted=False, name_=None, status=TripStatus.PLANNED.value
    )
    derived_trip.name = old_name
    manual_trip = MagicMock(is_deleted=False, status=TripStatus.PLANNED.value)
    manual_trip.name = "hand-renamed"

    task_exe = MagicMock()
    task_exe.result = {"trip_name": old_name, "assigned_user_uuid": "drv_a"}
    task_exe.workflow_execution.trips = [derived_trip, manual_trip]

    assignee = MagicMock(uuid="u-b")
    assignee.username = "drv_b"

    uow = MagicMock()
    uow.task_execution_repository.find_one.return_value = task_exe
    uow.user_repository.find_one.return_value = assignee
    uow.session.query.return_value.join.return_value.join.return_value.filter.return_value.first.return_value = None

    StartTripOperator().execute(
        uow=uow,
        payload=TaskExecutionComplete(
            uuid="te-1",
            result=_valid(assigned_user_uuid="drv_b"),
            completed_by_uuid="someone",
        ),
    )

    assert derived_trip.name == trip_name_for("drv_b", today)
    assert manual_trip.name == "hand-renamed"
    assert task_exe.result["trip_name"] == trip_name_for("drv_b", today)


def test_old_form_fields_are_refused_loudly():
    """extra=forbid: a stale client posting the old shape gets a validation
    error naming the field, not a trip configured with silently dropped inputs."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        StartTripOperatorSchema(**_valid(manual_stops=True))
    with pytest.raises(ValidationError):
        StartTripOperatorSchema(**_valid(max_stops=20))
