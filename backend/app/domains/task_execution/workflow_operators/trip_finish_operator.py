

from datetime import datetime
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import OperatorType, TaskExecutionComplete
from pydantic import BaseModel, ConfigDict
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.dto.trip import TripStatus


class TripFinishOperatorSchema(BaseModel):
    """Cash and inventory are derived automatically (payments / vehicle events
    tagged to the trip's stops), so finishing only takes optional notes."""
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None


def close_trip(uow: SqlAlchemyUnitOfWork, trip, notes: Optional[str] = None) -> None:
    """The trip-record half of finishing: append the notes, snapshot the van's
    closing stock, and mark the trip completed. Shared by the finish step and by
    skip-and-finish (app/domains/trip/skip_and_finish.py), so the two ways a trip
    can end leave the same record behind."""
    if notes:
        trip.notes = (f"{trip.notes}\n" if trip.notes else "") + notes

    # snapshot the vehicle's per-material inventory at trip end
    from app.domains.vehicle_inventory.domain import VehicleInventoryDomain
    trip.end_inventory = VehicleInventoryDomain.balances_for_vehicle(uow=uow, vehicle_uuid=trip.vehicle_uuid)

    trip.status = TripStatus.COMPLETED.value
    trip.end_time = datetime.now()
    uow.trip_repository.save(model=trip, commit=False)


class TripFinishOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = TripFinishOperatorSchema(**(payload.result or {}))
        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        self.task_exe = task_exe

        trip = self.get_trip()
        if not trip:
            raise BadRequestError(f"Trip not found for TaskExecution with uuid: {payload.uuid}")

        # all stops must be resolved before the trip can be finished
        open_stops = [
            te for te in task_exe.workflow_execution.task_executions
            if te.operator == OperatorType.TRIP_STOP_OPERATOR.value
            and te.status in (WorkflowStatus.NOT_STARTED.value, WorkflowStatus.IN_PROGRESS.value)
        ]
        if open_stops:
            raise BadRequestError(
                f"Cannot finish the trip: {len(open_stops)} trip stop(s) still open"
            )

        close_trip(uow=uow, trip=trip, notes=operator_schema.notes)

        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid

        # Save the task execution with the result
        uow.task_execution_repository.save(task_exe, commit=False)

    def validate(self):
        raise NotImplementedError("The validate method must be implemented by subclasses.")

    @property
    def name(self) -> str:
        # name of class
        return self.__class__.__name__


    def get_trip(self):
        trips = self.task_exe.workflow_execution.trips
        return trips[0] if trips else None
