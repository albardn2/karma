

from datetime import datetime
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork




# class TripOperatorSchema(BaseModel):
#     pass

class TripOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        # operator_schema = TripOperatorSchema(**payload.result)
        # check if all children are either skipped or complete, otherwise raise


        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        # THIS STEP STARTS THE TRIP. Everything before it is planning: the trip
        # row exists so stops can be laid out, but it sits at PLANNED and the
        # location ingest ignores it (it only stamps pings for in-progress
        # trips). Completing this step is the driver saying "I am setting off".
        from models.common import (
            Trip as TripModel,
            WorkflowExecution as WFEModel,
            TaskExecution as TEModel,
            Task as TaskModel,
        )
        from app.domains.task_execution.workflow_operators.trip_setup import (
            assignee_identifiers,
            resolve_assignee,
            start_trip_result,
        )
        from app.dto.trip import TripStatus

        trips = task_exe.workflow_execution.trips
        trip = next((t for t in trips if not t.is_deleted), None)
        if trip is None:
            raise BadRequestError("This workflow execution has no trip to start")

        if trip.status == TripStatus.PLANNED.value:
            setup = start_trip_result(task_exe.workflow_execution.task_executions) or {}
            assignee = resolve_assignee(uow, setup.get("assigned_user_uuid"))

            # Every PLANNED trip was set up through the new form, which refused
            # blank assignees and checked the user existed — so a failed
            # resolution here means the user was renamed or removed SINCE the
            # plan was made. The one-trip rule below cannot be checked without
            # knowing who is driving, and skipping it would let the renamed
            # driver run two trips at once, so refusing is the only honest move.
            if assignee is None:
                raise BadRequestError(
                    "The user this trip was planned for no longer exists — they "
                    "may have been renamed or removed. Re-submit the setup step "
                    "with a current driver before starting the trip."
                )

            # A driver can be in exactly one place, so only one trip may be
            # UNDERWAY at a time — several may be planned (one per day). This is
            # the rule the setup step deliberately does not enforce.
            running = (
                uow.session.query(TripModel.uuid)
                .join(WFEModel, WFEModel.uuid == TripModel.workflow_execution_uuid)
                .join(TEModel, TEModel.workflow_execution_uuid == WFEModel.uuid)
                .join(TaskModel, TaskModel.uuid == TEModel.task_uuid)
                .filter(
                    TripModel.status == TripStatus.IN_PROGRESS.value,
                    TripModel.is_deleted.is_(False),
                    TripModel.account_uuid == uow.account_uuid,
                    TripModel.uuid != trip.uuid,
                    TaskModel.operator == "start_trip_operator",
                    TEModel.result["assigned_user_uuid"].astext.in_(
                        assignee_identifiers(assignee)
                    ),
                )
                .first()
            )
            if running:
                raise BadRequestError(
                    f"{assignee.username} already has a trip under way; finish "
                    "or cancel it before starting this one."
                )

            # opening stock, captured now that the van is loaded and leaving
            from app.domains.vehicle_inventory.domain import VehicleInventoryDomain

            trip.start_inventory = VehicleInventoryDomain.balances_for_vehicle(
                uow=uow, vehicle_uuid=trip.vehicle_uuid
            )
            trip.status = TripStatus.IN_PROGRESS.value
            # stamped here rather than at creation, so the trip's clock (and the
            # location playback window) measures driving, not planning
            trip.start_time = datetime.now()
            uow.trip_repository.save(model=trip, commit=False)

    # task_exe.result = operator_schema.model_dump(mode="json")
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



