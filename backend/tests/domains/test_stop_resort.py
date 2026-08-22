"""Re-sorting a trip's remaining stops around the driver.

Two properties carry this feature:

  ORDER — the pending stops come out nearest-first from where the driver is,
  which is not the same as nearest-first from the depot the trip was planned
  around.

  UNLOCKING — the depends_on chain is rewired to match. This is the part that
  matters: both clients derive the order they show from that chain, and a
  not_started stop cannot be completed, so a re-sort that only shuffled
  trip_stop.index would change nothing the driver experiences.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from geoalchemy2 import WKTElement

from app.domains.trip.stop_resort import (
    order_from_anchor,
    resort_pending_stops,
)
from app.dto.task_execution import OperatorType
from app.dto.workflow_execution import WorkflowStatus
from app.entrypoint.routes.common.errors import BadRequestError

NOT_STARTED = WorkflowStatus.NOT_STARTED.value
IN_PROGRESS = WorkflowStatus.IN_PROGRESS.value
COMPLETED = WorkflowStatus.COMPLETED.value


def stop_row(uuid, lon, lat, te_uuid=None):
    return SimpleNamespace(
        uuid=uuid,
        index=None,
        coordinates=WKTElement(f"POINT({lon} {lat})", srid=4326),
        task_execution_uuid=te_uuid or f"te-{uuid}",
    )


def stop_te(uuid, name, status=NOT_STARTED, depends_on=None):
    return SimpleNamespace(
        uuid=uuid,
        name=name,
        operator=OperatorType.TRIP_STOP_OPERATOR.value,
        status=status,
        depends_on=list(depends_on or []),
        start_time=None,
        end_time=None,
        created_at=None,
    )


def scenario(stop_specs, trip_done=True, worked=()):
    """A workflow execution with a trip task, some stops, and a finish task."""
    trip_te = SimpleNamespace(
        uuid="te-trip", name="trip", operator=OperatorType.TRIP_OPERATOR.value,
        status=COMPLETED if trip_done else IN_PROGRESS, depends_on=["trip_create"],
        start_time=None, end_time=None, created_at=1,
    )
    finish_te = SimpleNamespace(
        uuid="te-finish", name="finish_trip",
        operator=OperatorType.TRIP_FINISH_OPERATOR.value, status=NOT_STARTED,
        depends_on=[], start_time=None, end_time=None, created_at=99,
    )
    tes, stops = [trip_te], []
    for name, lon, lat, status in stop_specs:
        te = stop_te(f"te-{name}", f"trip_stop_{name}", status=status)
        tes.append(te)
        stops.append(stop_row(name, lon, lat, te_uuid=te.uuid))
    for name in worked:
        te = stop_te(f"te-{name}", f"trip_stop_{name}", status=COMPLETED)
        te.created_at = 2
        tes.append(te)
        stops.append(stop_row(name, 36.0, 33.0, te_uuid=te.uuid))
    tes.append(finish_te)

    trip = SimpleNamespace(stops=stops, status="in_progress")
    wfe = SimpleNamespace(task_executions=tes, trips=[trip])
    uow = MagicMock()
    return uow, wfe, {te.name: te for te in tes}, {s.uuid: s for s in stops}


# --- ordering ----------------------------------------------------------------

def test_orders_nearest_first_from_the_given_point():
    west = stop_row("west", 36.20, 33.50)
    middle = stop_row("middle", 36.30, 33.50)
    east = stop_row("east", 36.40, 33.50)
    # standing at the eastern end, the east stop is next
    ordered = order_from_anchor([west, middle, east], (36.45, 33.50))
    assert [s.uuid for s in ordered] == ["east", "middle", "west"]
    # standing at the western end, the order reverses
    ordered = order_from_anchor([west, middle, east], (36.15, 33.50))
    assert [s.uuid for s in ordered] == ["west", "middle", "east"]


def test_ordering_chains_rather_than_ranking_by_distance_from_the_start():
    """Nearest-neighbour walks the set: after the first hop the next stop is
    the one nearest THAT stop, not the one next-nearest the driver."""
    near = stop_row("near", 36.30, 33.50)
    far_pair_a = stop_row("far_a", 36.60, 33.50)
    far_pair_b = stop_row("far_b", 36.61, 33.50)
    ordered = order_from_anchor([far_pair_b, near, far_pair_a], (36.29, 33.50))
    assert [s.uuid for s in ordered] == ["near", "far_a", "far_b"]


def test_stops_without_usable_coordinates_go_last_but_are_kept():
    good = stop_row("good", 36.30, 33.50)
    broken = SimpleNamespace(uuid="broken", index=None, coordinates=None,
                             task_execution_uuid="te-broken")
    ordered = order_from_anchor([broken, good], (36.29, 33.50))
    assert [s.uuid for s in ordered] == ["good", "broken"]


# --- chain rewiring ----------------------------------------------------------

def _resort(uow, wfe, lat, lon):
    # the road path is a drawing detail; keep the unit tests off the network
    import app.domains.trip.stop_resort as mod
    original = mod.road_path
    mod.road_path = lambda points: []
    try:
        return resort_pending_stops(uow=uow, workflow_exe=wfe, latitude=lat, longitude=lon)
    finally:
        mod.road_path = original


def test_pending_stops_are_relinked_in_the_new_order():
    uow, wfe, by_name, _ = scenario([
        ("west", 36.20, 33.50, IN_PROGRESS),
        ("middle", 36.30, 33.50, NOT_STARTED),
        ("east", 36.40, 33.50, NOT_STARTED),
    ])
    result = _resort(uow, wfe, lat=33.50, lon=36.45)  # driver is at the east end

    assert result["task_execution_uuids"] == ["te-east", "te-middle", "te-west"]
    # anchor -> east -> middle -> west -> finish
    assert by_name["trip_stop_east"].depends_on == ["trip"]
    assert by_name["trip_stop_middle"].depends_on == ["trip_stop_east"]
    assert by_name["trip_stop_west"].depends_on == ["trip_stop_middle"]
    assert by_name["finish_trip"].depends_on == ["trip_stop_west"]


def test_the_nearest_stop_becomes_the_current_one_and_the_rest_wait():
    uow, wfe, by_name, _ = scenario([
        ("west", 36.20, 33.50, IN_PROGRESS),
        ("east", 36.40, 33.50, NOT_STARTED),
    ])
    _resort(uow, wfe, lat=33.50, lon=36.45)
    # the stop that WAS current is demoted; the nearest one takes over, so the
    # driver can actually complete it (a not_started stop cannot be completed)
    assert by_name["trip_stop_east"].status == IN_PROGRESS
    assert by_name["trip_stop_east"].start_time is not None
    assert by_name["trip_stop_west"].status == NOT_STARTED
    assert by_name["trip_stop_west"].start_time is None


def test_nothing_is_activated_while_the_trip_step_is_still_open():
    """Re-sorting at the trip step (before it is completed) must not jump the
    gun and open a stop — the chain still waits on that step."""
    uow, wfe, by_name, _ = scenario([
        ("west", 36.20, 33.50, NOT_STARTED),
        ("east", 36.40, 33.50, NOT_STARTED),
    ], trip_done=False)
    result = _resort(uow, wfe, lat=33.50, lon=36.45)
    assert result["current_task_execution_uuid"] is None
    assert by_name["trip_stop_east"].status == NOT_STARTED
    assert by_name["trip_stop_east"].depends_on == ["trip"]


def test_completed_stops_are_left_alone_and_anchor_the_tail():
    uow, wfe, by_name, _ = scenario(
        [("west", 36.20, 33.50, NOT_STARTED), ("east", 36.40, 33.50, NOT_STARTED)],
        worked=("done",),
    )
    _resort(uow, wfe, lat=33.50, lon=36.45)
    assert by_name["trip_stop_done"].status == COMPLETED
    # the tail hangs off the finished stop, which is where the trip actually is
    assert by_name["trip_stop_east"].depends_on == ["trip_stop_done"]
    assert by_name["trip_stop_east"].status == IN_PROGRESS


def test_indexes_follow_the_chain_after_the_worked_stops():
    uow, wfe, _, stops = scenario(
        [("west", 36.20, 33.50, NOT_STARTED), ("east", 36.40, 33.50, NOT_STARTED)],
        worked=("done",),
    )
    _resort(uow, wfe, lat=33.50, lon=36.45)
    assert stops["east"].index == 1  # one stop already worked
    assert stops["west"].index == 2


def test_waypoints_start_at_the_driver_and_are_lat_lon():
    uow, wfe, _, _ = scenario([("east", 36.40, 33.50, NOT_STARTED)])
    result = _resort(uow, wfe, lat=33.51, lon=36.45)
    assert result["waypoints"][0] == (33.51, 36.45)
    assert result["waypoints"][1] == (33.50, 36.40)


def test_a_trip_with_nothing_pending_is_refused():
    uow, wfe, _, _ = scenario([("done_only", 36.2, 33.5, COMPLETED)])
    with pytest.raises(BadRequestError):
        _resort(uow, wfe, lat=33.5, lon=36.2)
