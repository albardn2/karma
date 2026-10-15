"""Skip and finish: ending a trip whose stop list was not worked through.

The property that matters is what is left OPEN afterwards — nothing. A stop
left at planned/in_progress keeps its customer out of every future
strategy-built trip (the routing pool skips anyone holding an unfinished stop),
and a run left in progress keeps showing as live and blocks planning the
assignee's next trip for that day. So every scenario here ends by asserting no
trip_stop outside FINISHED_TRIP_STOP_STATUSES and no TE still not_started or
in_progress.
"""
import inspect
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.domains.trip.skip_and_finish import SKIPPED_STOP_MESSAGE, skip_and_finish_trip
from app.dto.task_execution import OperatorType
from app.dto.trip import TripStatus
from app.dto.trip_stop import FINISHED_TRIP_STOP_STATUSES, TripStopStatus
from app.dto.workflow_execution import WorkflowStatus
from app.entrypoint.routes.common.errors import BadRequestError

NOT_STARTED = WorkflowStatus.NOT_STARTED.value
IN_PROGRESS = WorkflowStatus.IN_PROGRESS.value
COMPLETED = WorkflowStatus.COMPLETED.value
CANCELLED = WorkflowStatus.CANCELLED.value
FAILED = WorkflowStatus.FAILED.value

SALE = "sale - تم البيع"
SKIPPED_OUTCOME = "skipped:customer_not_available - تم التخطي: العميل غير متاح"

CLOSING_STOCK = {"mat-1": 4.0}


@pytest.fixture(autouse=True)
def _closing_stock(monkeypatch):
    from app.domains.vehicle_inventory.domain import VehicleInventoryDomain

    monkeypatch.setattr(
        VehicleInventoryDomain, "balances_for_vehicle",
        staticmethod(lambda uow, vehicle_uuid: dict(CLOSING_STOCK)),
    )


def te(uuid, operator, status, name=None, depends_on=None, start_time=None):
    return SimpleNamespace(
        uuid=uuid, name=name or uuid, operator=operator, status=status,
        depends_on=list(depends_on or []), start_time=start_time, end_time=None,
        error_message=None, result={}, completed_by_uuid=None,
    )


def stop(uuid, status=TripStopStatus.IN_PROGRESS.value, te_uuid=None, outcome=None):
    return SimpleNamespace(uuid=uuid, status=status, task_execution_uuid=te_uuid, outcome=outcome)


def _run_state(stops, stop_tes, extra_tes=(), trip_status=TripStatus.IN_PROGRESS.value,
               run_status=IN_PROGRESS, with_finish=True):
    trip_te = te("te-trip", OperatorType.TRIP_OPERATOR.value, COMPLETED, name="trip")
    finish = te("te-finish", OperatorType.TRIP_FINISH_OPERATOR.value, NOT_STARTED,
                name="finish_trip", depends_on=[stop_tes[-1].name] if stop_tes else ["trip"])
    tes = [trip_te, *stop_tes, *extra_tes] + ([finish] if with_finish else [])
    trip = SimpleNamespace(
        uuid="trip-1", status=trip_status, stops=stops, notes=None,
        vehicle_uuid="veh-1", end_inventory=None, end_time=None,
    )
    wfe = SimpleNamespace(uuid="wfe-1", status=run_status, end_time=None,
                          task_executions=tes, trips=[trip])
    return MagicMock(), wfe, trip, {t.uuid: t for t in tes}


def _typical():
    """Two stops worked, the current one not, two more upcoming."""
    stop_tes = [
        te("te-a", OperatorType.TRIP_STOP_OPERATOR.value, COMPLETED, name="stop_a"),
        te("te-b", OperatorType.TRIP_STOP_OPERATOR.value, COMPLETED, name="stop_b", depends_on=["stop_a"]),
        te("te-c", OperatorType.TRIP_STOP_OPERATOR.value, IN_PROGRESS, name="stop_c", depends_on=["stop_b"]),
        te("te-d", OperatorType.TRIP_STOP_OPERATOR.value, NOT_STARTED, name="stop_d", depends_on=["stop_c"]),
        te("te-e", OperatorType.TRIP_STOP_OPERATOR.value, NOT_STARTED, name="stop_e", depends_on=["stop_d"]),
    ]
    stops = [
        stop("a", TripStopStatus.COMPLETED.value, "te-a", SALE),
        stop("b", TripStopStatus.SKIPPED.value, "te-b", SKIPPED_OUTCOME),
        stop("c", te_uuid="te-c"),
        stop("d", te_uuid="te-d"),
        stop("e", te_uuid="te-e"),
    ]
    return _run_state(stops, stop_tes)


def _assert_nothing_open(wfe, trip):
    open_stops = [s.uuid for s in trip.stops if s.status not in FINISHED_TRIP_STOP_STATUSES]
    assert open_stops == []
    open_tes = [t.uuid for t in wfe.task_executions if t.status in (NOT_STARTED, IN_PROGRESS)]
    assert open_tes == []
    assert wfe.status == COMPLETED
    assert trip.status == TripStatus.COMPLETED.value


# --- the main path -------------------------------------------------------------

def test_unvisited_stops_are_cancelled_and_the_trip_finishes():
    uow, wfe, trip, tes = _typical()
    out = skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")

    _assert_nothing_open(wfe, trip)
    by = {s.uuid: s for s in trip.stops}
    # the current stop and the upcoming ones
    for uuid in ("c", "d", "e"):
        assert by[uuid].status == TripStopStatus.CANCELLED.value
        assert tes[f"te-{uuid}"].status == CANCELLED
        assert tes[f"te-{uuid}"].error_message == SKIPPED_STOP_MESSAGE
        assert tes[f"te-{uuid}"].end_time is not None
    assert out == {"workflow_execution_uuid": "wfe-1", "trip_uuid": "trip-1", "cancelled_stop_count": 3}


def test_worked_stops_keep_what_the_rep_reported():
    uow, wfe, trip, tes = _typical()
    skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    by = {s.uuid: s for s in trip.stops}
    assert (by["a"].status, by["a"].outcome) == (TripStopStatus.COMPLETED.value, SALE)
    assert (by["b"].status, by["b"].outcome) == (TripStopStatus.SKIPPED.value, SKIPPED_OUTCOME)
    assert tes["te-a"].status == COMPLETED and tes["te-a"].error_message is None


def test_a_cancelled_stop_gets_no_outcome():
    """An outcome is what visit dates and auto-tags read; a stop nobody reached
    must not acquire one."""
    uow, wfe, trip, _ = _typical()
    skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    assert [s.outcome for s in trip.stops if s.status == TripStopStatus.CANCELLED.value] == [None, None, None]


def test_the_finish_step_runs_as_the_finish_operator_would():
    uow, wfe, trip, tes = _typical()
    skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv", notes="ran out of time")

    finish = tes["te-finish"]
    assert finish.status == COMPLETED
    assert finish.completed_by_uuid == "u-drv"
    assert finish.result == {"notes": "ran out of time"}
    assert finish.start_time is not None and finish.end_time is not None
    assert trip.end_inventory == CLOSING_STOCK
    assert trip.end_time is not None
    assert trip.notes == "ran out of time"
    assert wfe.end_time is not None


def test_a_trip_with_every_stop_done_still_finishes():
    stop_tes = [te("te-a", OperatorType.TRIP_STOP_OPERATOR.value, COMPLETED, name="stop_a")]
    uow, wfe, trip, tes = _run_state([stop("a", TripStopStatus.COMPLETED.value, "te-a", SALE)], stop_tes)
    tes["te-finish"].status = IN_PROGRESS
    out = skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    _assert_nothing_open(wfe, trip)
    assert out["cancelled_stop_count"] == 0


# --- rows the TE chain alone would miss -------------------------------------------

def test_stale_rows_are_closed_too():
    """A stop with no TE, a stop whose TE completed but whose own status never
    advanced (pre-f4a7c2e9b183 data), a stop TE whose trip_stop is gone, and a
    child TE — none may outlive the trip."""
    stop_tes = [
        te("te-legacy", OperatorType.TRIP_STOP_OPERATOR.value, COMPLETED, name="stop_legacy"),
        te("te-orphan", OperatorType.TRIP_STOP_OPERATOR.value, NOT_STARTED, name="stop_orphan"),
    ]
    child = te("te-child", None, NOT_STARTED, name="child")
    stops = [
        stop("no-te", status=TripStopStatus.PLANNED.value, te_uuid=None),
        stop("legacy", te_uuid="te-legacy", outcome=SKIPPED_OUTCOME),
        stop("legacy-blank", te_uuid="te-legacy", outcome="  "),
    ]
    uow, wfe, trip, tes = _run_state(stops, stop_tes, extra_tes=[child])
    skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")

    _assert_nothing_open(wfe, trip)
    by = {s.uuid: s.status for s in trip.stops}
    assert by["no-te"] == TripStopStatus.CANCELLED.value
    assert by["legacy"] == TripStopStatus.SKIPPED.value  # classified, as the migration would
    assert by["legacy-blank"] == TripStopStatus.COMPLETED.value  # a blank outcome is a completion
    assert tes["te-orphan"].status == CANCELLED
    assert tes["te-child"].status == CANCELLED


def test_a_failed_step_is_left_as_it_is():
    failed = te("te-failed", OperatorType.TRIP_STOP_OPERATOR.value, FAILED, name="stop_f")
    uow, wfe, trip, tes = _run_state([stop("f", TripStopStatus.COMPLETED.value, "te-failed")], [failed])
    skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    assert tes["te-failed"].status == FAILED
    assert tes["te-failed"].error_message is None


def test_a_run_without_a_finish_step_still_ends_completed():
    stop_tes = [te("te-a", OperatorType.TRIP_STOP_OPERATOR.value, IN_PROGRESS, name="stop_a")]
    uow, wfe, trip, _ = _run_state([stop("a", te_uuid="te-a")], stop_tes, with_finish=False)
    skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    _assert_nothing_open(wfe, trip)


# --- refusals: nothing is written --------------------------------------------------

@pytest.mark.parametrize("trip_status", [
    TripStatus.PLANNED.value, TripStatus.COMPLETED.value, TripStatus.CANCELLED.value,
])
def test_only_a_trip_under_way_can_be_skipped_and_finished(trip_status):
    uow, wfe, trip, tes = _typical()
    trip.status = trip_status
    with pytest.raises(BadRequestError):
        skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    assert wfe.status == IN_PROGRESS
    assert tes["te-c"].status == IN_PROGRESS
    assert {s.uuid: s.status for s in trip.stops}["d"] == TripStopStatus.IN_PROGRESS.value


@pytest.mark.parametrize("run_status", [COMPLETED, CANCELLED, FAILED, NOT_STARTED])
def test_a_run_that_is_not_in_progress_is_refused(run_status):
    """Also what the second of two simultaneous requests sees once the route's
    row lock lets it through."""
    uow, wfe, trip, tes = _typical()
    wfe.status = run_status
    with pytest.raises(BadRequestError):
        skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")
    assert tes["te-d"].status == NOT_STARTED
    uow.trip_stop_repository.save.assert_not_called()
    uow.task_execution_repository.save.assert_not_called()


def test_a_run_with_no_trip_is_refused():
    uow, wfe, _, _ = _typical()
    wfe.trips = []
    with pytest.raises(BadRequestError):
        skip_and_finish_trip(uow=uow, workflow_exe=wfe, completed_by_uuid="u-drv")


# --- the route --------------------------------------------------------------------

def test_the_route_matches_the_other_mid_trip_actions():
    """Same roles as manual-stop / set-current-stop / resort-stops (drivers and
    sales reps run trips; accountants do not), the same per-trip ownership
    check, and the run is locked before it is read."""
    from app.entrypoint.routes.workflow_execution import routes

    src = inspect.getsource(routes.skip_and_finish)
    manual = inspect.getsource(routes.add_manual_stop)

    def scopes(code):
        block = code.split("@scopes_required(", 1)[1].split(")\ndef ", 1)[0]
        return sorted(line.strip().rstrip(",)") for line in block.splitlines() if "PermissionScope." in line)

    assert scopes(src) == scopes(manual)
    assert "_assert_execution_access(uow, workflow_exe)" in src
    assert '"/<string:uuid>/skip-and-finish", methods=["POST"]' in src


# --- one writer per run at a time ------------------------------------------------
#
# The driver's app and the office's page write the same run. Skip-and-finish
# alone holding a lock would not stop a stop being added, completed or re-sorted
# underneath it and landing open on the finished trip — so every writer takes
# the run's row lock before it reads the run.

@pytest.mark.parametrize("route", ["skip_and_finish", "add_manual_stop", "set_current_stop", "resort_stops"])
def test_every_mid_trip_route_locks_the_run_before_reading_it(route):
    from app.entrypoint.routes.workflow_execution import routes

    src = inspect.getsource(getattr(routes, route))
    assert "lock_run(uow, workflow_exe)" in src
    # straight after the lookup, ahead of the first read of the run's state
    assert src.index("lock_run(uow, workflow_exe)") < src.index("_assert_execution_access(uow, workflow_exe)")


def test_the_lock_is_a_row_lock_on_the_run():
    from app.domains.workflow_execution.run_lock import lock_run

    uow, run = MagicMock(), object()
    lock_run(uow, run)
    uow.session.refresh.assert_called_once_with(run, with_for_update=True)


def test_completing_a_stop_rereads_it_under_the_lock():
    """The driver submits the current stop just as the office skips and
    finishes. If the finish committed first, the stop reads cancelled once the
    lock is held — and is refused, not completed over the top of it."""
    from app.domains.task_execution.domain import TaskExecutionDomain
    from app.dto.task_execution import TaskExecutionComplete

    run = SimpleNamespace(is_deleted=False)
    stop_te = SimpleNamespace(uuid="te-c", status=IN_PROGRESS, workflow_execution=run)
    uow = MagicMock()
    uow.task_execution_repository.find_one.return_value = stop_te
    calls = []

    def refresh(obj, **kw):
        calls.append((obj, kw))
        if obj is stop_te:  # what the other transaction committed
            stop_te.status = CANCELLED

    uow.session.refresh.side_effect = refresh
    with pytest.raises(BadRequestError):
        TaskExecutionDomain.complete_task_execution(
            uow=uow, payload=TaskExecutionComplete(uuid="te-c", result={}, completed_by_uuid="u"),
        )
    assert calls == [(run, {"with_for_update": True}), (stop_te, {})]  # lock first, then re-read


def test_cancelling_rereads_the_run_under_the_lock():
    from app.domains.workflow_execution.domain import WorkflowExecutionDomain

    run = SimpleNamespace(uuid="wfe-1", status=IN_PROGRESS, trips=[])
    uow = MagicMock()
    uow.workflow_execution_repository.find_one.return_value = run

    def refresh(obj, **kw):
        assert kw == {"with_for_update": True}
        run.status = COMPLETED  # skip-and-finish committed while we waited

    uow.session.refresh.side_effect = refresh
    with pytest.raises(BadRequestError):
        WorkflowExecutionDomain.cancel_workflow_execution(uow=uow, uuid="wfe-1")
    assert run.status == COMPLETED
