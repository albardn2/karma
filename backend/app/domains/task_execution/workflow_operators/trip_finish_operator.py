

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

from app.dto.common_enums import Currency
from app.dto.trip import TripStatus

class InventoryLeftInput(BaseModel):
    inventory_uuid:str
    quantity: float


class TripFinishOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cash_collected: float
    inventory_left: list[InventoryLeftInput]


class TripFinishOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = TripFinishOperatorSchema(**payload.result)
        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        self.task_exe = task_exe

        trip = self.get_trip()
        if not trip:
            raise BadRequestError(f"Trip not found for TaskExecution with uuid: {payload.uuid}")

        # set data["output"]

        trip.data["output"] = {
            "cash_collected": operator_schema.cash_collected,
            "currency": Currency.SYP.value,
            "inventory_left": [inv.model_dump(mode="json") for inv in operator_schema.inventory_left]
        }

        trip.status = TripStatus.COMPLETED.value
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
       trip = self.task_exe.workflow_execution.trip

       return trip



