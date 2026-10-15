"""Ending a trip before every stop has been visited.

A strategy can hand a rep more stops than a day allows. The normal finish step
refuses while any stop is open (TripFinishOperator), and cancelling the trip
throws away the fact that it ran. Skip-and-finish is the third way out: the
stops nobody got to are cancelled and the trip is finished as usual.

What it must leave behind is NOTHING OPEN, because open rows outlive the trip:

  * the routing pool (customer_repository.fetch_priority_routing_pool) skips
    every customer holding a trip_stop whose status is not in
    FINISHED_TRIP_STOP_STATUSES, so a stop left at in_progress keeps its
    customer off every future strategy-built trip;
  * the stop TEs and the finish TE are chained by depends_on, and a cancelled
    stop never unblocks its successor — so the finish step has to be driven
    here rather than through /task-execution/complete;
  * complete_task_execution only completes the workflow execution when every TE
    completed, which cancelled stops prevent — so it is completed here too,
    or the run stays "in progress" in both clients' lists and blocks planning
    the assignee's next trip for that day.

A stop that was WORKED keeps what the rep reported, the same rule
TripDomain.cancel_trip and migration f4a7c2e9b183 apply: a recorded outcome or
a completed TE classifies the stop by its outcome (status_for_outcome). Only
the stops never worked are cancelled. A cancelled stop gets no outcome, so it
counts as no visit (customer/visit_dates.py) and moves no tags.

Orders and payments taken at a stop are not touched, whatever its status:
a sale made is real, and the trip's cash and activity read them by stop uuid.
"""
from datetime import datetime
from typing import Optional

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.task_execution.workflow_operators.trip_finish_operator import close_trip
from app.domains.task_execution.workflow_operators.trip_stop_operator import status_for_outcome
from app.dto.task_execution import OperatorType
from app.dto.trip import TripStatus
from app.dto.trip_stop import FINISHED_TRIP_STOP_STATUSES, TripStopStatus
from app.dto.workflow_execution import WorkflowStatus
from app.entrypoint.routes.common.errors import BadRequestError

# written to every TE this closes, so a cancelled stop says why it was
# cancelled — and is told apart from "Task execution was cancelled by user"
SKIPPED_STOP_MESSAGE = "Not visited: the trip was finished early (skip and finish)"

# a TE in any of these is done and is left as it is; 'failed' included, exactly
# as in cancel_task_executions — a failed step must not be rewritten
_TERMINAL_TE_STATUSES = (
    WorkflowStatus.COMPLETED.value,
    WorkflowStatus.CANCELLED.value,
    WorkflowStatus.FAILED.value,
    WorkflowStatus.SKIPPED.value,
)


def _operator(te) -> Optional[str]:
    # TaskExecution.operator reads te.task.operator, which raises for a TE
    # without a task; getattr's default swallows that AttributeError
    return getattr(te, "operator", None)


def _worked(stop, te) -> bool:
    """The predicate migration f4a7c2e9b183 and customer/visit_dates.py use."""
    if (stop.outcome or "").strip():
        return True
    return te is not None and te.status == WorkflowStatus.COMPLETED.value


def skip_and_finish_trip(
    uow: SqlAlchemyUnitOfWork,
    workflow_exe,
    completed_by_uuid: Optional[str],
    notes: Optional[str] = None,
) -> dict:
    """Cancel the trip's unvisited stops and finish it, in the caller's unit of
    work. Raises BadRequestError, before writing anything, unless the run and
    its trip are both in progress."""
    if workflow_exe.status != WorkflowStatus.IN_PROGRESS.value:
        raise BadRequestError(f"Trip run is not in progress (status: {workflow_exe.status})")
    trips = workflow_exe.trips
    if not trips:
        raise BadRequestError("This workflow execution has no trip yet")
    trip = trips[0]
    if trip.status != TripStatus.IN_PROGRESS.value:
        raise BadRequestError(f"Trip is not in progress (status: {trip.status})")

    now = datetime.now()
    tes = list(workflow_exe.task_executions)
    te_by_uuid = {te.uuid: te for te in tes}
    finish_te = next(
        (te for te in tes if _operator(te) == OperatorType.TRIP_FINISH_OPERATOR.value),
        None,
    )

    # 1. the stops — from the trip, not the TEs, so a stop whose TE is missing
    #    is closed too
    cancelled_stops = 0
    for stop in trip.stops:
        if stop.status in FINISHED_TRIP_STOP_STATUSES:
            continue
        if _worked(stop, te_by_uuid.get(stop.task_execution_uuid)):
            stop.status = status_for_outcome(stop.outcome)
        else:
            stop.status = TripStopStatus.CANCELLED.value
            cancelled_stops += 1
        uow.trip_stop_repository.save(stop, commit=False)

    # 2. every other open TE — the stops' own, their children, and any whose
    #    trip_stop row is gone. workflow_exe.task_executions holds children
    #    too: they carry the same workflow_execution_uuid.
    for te in tes:
        if te is finish_te or te.status in _TERMINAL_TE_STATUSES:
            continue
        te.status = WorkflowStatus.CANCELLED.value
        te.end_time = now
        te.error_message = SKIPPED_STOP_MESSAGE
        uow.task_execution_repository.save(model=te, commit=False)

    # 3. the finish step, as TripFinishOperator would run it
    close_trip(uow=uow, trip=trip, notes=notes)
    if finish_te is not None and finish_te.status not in _TERMINAL_TE_STATUSES:
        finish_te.result = {"notes": notes}
        finish_te.status = WorkflowStatus.COMPLETED.value
        finish_te.start_time = finish_te.start_time or now
        finish_te.end_time = now
        finish_te.completed_by_uuid = completed_by_uuid
        uow.task_execution_repository.save(model=finish_te, commit=False)

    # 4. the run
    workflow_exe.status = WorkflowStatus.COMPLETED.value
    workflow_exe.end_time = now
    uow.workflow_execution_repository.save(model=workflow_exe, commit=False)

    return {
        "workflow_execution_uuid": workflow_exe.uuid,
        "trip_uuid": trip.uuid,
        "cancelled_stop_count": cancelled_stops,
    }
