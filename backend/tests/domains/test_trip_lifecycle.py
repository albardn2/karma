"""Planned-until-started trips, and the two guards that replaced one.

The rule used to be "one open workflow per driver", which made planning a week
impossible. It is now split in two, because the two things being protected are
different:

  PLANNING (start_trip_operator) — at most one open workflow per driver PER DAY.
  Monday and Tuesday may both be open; the same day twice is a mistake.

  DRIVING (trip_operator) — at most one trip UNDER WAY per driver, because a
  driver can only be in one place. This is the step that starts the trip.

Between the two, the trip sits at PLANNED: its stops exist so they can be
ordered, but nothing treats it as live — including the location ingest, which
only stamps pings for in-progress trips.
"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.dto.task_execution import OperatorType, TaskExecutionComplete
from app.dto.trip import TripStatus
from app.dto.workflow_execution import WorkflowStatus
from app.entrypoint.routes.common.errors import BadRequestError


def _assignee(username="drv_test", uuid="u-1"):
    user = MagicMock(uuid=uuid)
    user.username = username
    return user


def _setup_te(result):
    return SimpleNamespace(
        uuid="te-setup", name="setup_trip_config",
        operator=OperatorType.START_TRIP_OPERATOR.value,
        status=WorkflowStatus.COMPLETED.value, result=result,
        depends_on=[], start_time=None, end_time=None, created_at=1,
    )


# --- the trip is PLANNED until someone starts it -----------------------------

def test_a_created_trip_is_planned_not_underway():
    """Read the source of truth rather than a copy: create_trip_operator must
    hand TripCreate a PLANNED status and no start_time."""
    import inspect

    from app.domains.task_execution.workflow_operators import create_trip_operator as mod

    src = inspect.getsource(mod.CreateTripOperator.execute)
    assert "status=TripStatus.PLANNED.value" in src
    assert "start_time=None" in src
    # and nothing in that call still asks for in-progress
    assert "status=TripStatus.IN_PROGRESS.value" not in src


def test_location_ingest_only_stamps_trips_that_are_under_way():
    """Per-trip tracking must not begin while a trip is merely planned. The
    ingest expresses that as a status filter; pin it so a refactor cannot
    quietly widen it."""
    import inspect

    from location_ingest.__main__ import Ingestor

    src = inspect.getsource(Ingestor._active_trip_uuid)
    assert 'status == "in_progress"' in src or "status == 'in_progress'" in src
    assert "planned" not in src


# --- starting the trip -------------------------------------------------------

def _run_trip_operator(trip, setup_result, running_trip=None):
    from app.domains.task_execution.workflow_operators.trip_operator import TripOperator

    task_exe = MagicMock()
    task_exe.workflow_execution.trips = [trip]
    task_exe.workflow_execution.task_executions = [_setup_te(setup_result)]

    uow = MagicMock()
    uow.task_execution_repository.find_one.return_value = task_exe
    uow.user_repository.find_one.side_effect = lambda **kw: (
        _assignee() if kw.get("username") or kw.get("uuid") else None
    )
    # the "another trip under way" probe
    (uow.session.query.return_value.join.return_value.join.return_value
        .join.return_value.filter.return_value.first.return_value) = running_trip

    TripOperator().execute(
        uow=uow,
        payload=TaskExecutionComplete(uuid="te-trip", result={}, completed_by_uuid="x"),
    )
    return task_exe


def _planned_trip():
    return SimpleNamespace(
        uuid="trip-1", status=TripStatus.PLANNED.value,
        start_time=None, is_deleted=False,
        vehicle_uuid="veh-1", start_inventory=None,
    )


def test_completing_the_fourth_step_starts_the_trip():
    trip = _planned_trip()
    _run_trip_operator(trip, {"assigned_user_uuid": "drv_test"})
    assert trip.status == TripStatus.IN_PROGRESS.value
    assert isinstance(trip.start_time, datetime)  # stamped now, not at planning
    # opening stock is captured here too: the van is loaded between planning
    # and setting off, so a snapshot taken at creation would record an empty van
    assert trip.start_inventory is not None


def test_the_opening_stock_snapshot_is_not_taken_while_planning():
    import inspect

    from app.domains.task_execution.workflow_operators import create_trip_operator as mod

    assert "start_inventory" not in inspect.getsource(mod.CreateTripOperator.execute)


def test_a_driver_cannot_have_two_trips_under_way():
    trip = _planned_trip()
    with pytest.raises(BadRequestError) as err:
        _run_trip_operator(
            trip, {"assigned_user_uuid": "drv_test"}, running_trip=("trip-other",)
        )
    assert "under way" in str(err.value)
    assert trip.status == TripStatus.PLANNED.value  # left alone


def test_starting_a_trip_that_is_already_under_way_is_a_no_op():
    """The engine allows re-completing a completed step; that must not restamp
    the start time or re-run the guard."""
    started_at = datetime(2026, 8, 1, 7, 0, 0)
    trip = SimpleNamespace(
        uuid="trip-1", status=TripStatus.IN_PROGRESS.value,
        start_time=started_at, is_deleted=False,
        vehicle_uuid="veh-1", start_inventory={"m-1": 5},
    )
    _run_trip_operator(trip, {"assigned_user_uuid": "drv_test"})
    assert trip.start_time == started_at


def test_a_workflow_with_no_trip_is_refused():
    from app.domains.task_execution.workflow_operators.trip_operator import TripOperator

    task_exe = MagicMock()
    task_exe.workflow_execution.trips = []
    uow = MagicMock()
    uow.task_execution_repository.find_one.return_value = task_exe
    with pytest.raises(BadRequestError):
        TripOperator().execute(
            uow=uow,
            payload=TaskExecutionComplete(uuid="te-trip", result={}, completed_by_uuid="x"),
        )


# --- the planning guard is per DAY ------------------------------------------

def test_the_planning_guard_is_scoped_to_the_assigned_day():
    """Same driver, same day → refused. The query must carry BOTH the assignee
    and the date, so a different day is free."""
    import inspect

    from app.domains.task_execution.workflow_operators import start_trip_operator as mod

    src = inspect.getsource(mod.StartTripOperator.execute)
    assert 'result["assigned_user_uuid"]' in src
    assert 'result["assigned_date"]' in src
    # the message must name the day, or the dispatcher cannot tell which of
    # their week collided
    assert "already has a trip planned for" in src


# --- the dashboard counts trips on the day they RAN --------------------------

def test_the_trips_metric_is_anchored_on_when_the_trip_ran():
    """Planning a week ahead would otherwise credit Friday's trip to Monday.
    The count anchors on start_time (falling back to created_at, so trips made
    outside the workflow do not vanish) and skips trips still PLANNED."""
    import inspect

    from app.entrypoint.routes.dashboard import routes as mod

    src = inspect.getsource(mod)
    marker = "trip_ran_at = func.coalesce(TripModel.start_time, TripModel.created_at)"
    assert marker in src
    # the window filter and the grouping must both use that anchor, not created_at
    block = src.split(marker, 1)[1].split(".all()", 1)[0]
    assert "func.date(trip_ran_at)" in block
    assert "trip_ran_at >= start" in block
    assert "TripModel.status != TripStatus.PLANNED.value" in block
    assert "TripModel.created_at >= start" not in block
