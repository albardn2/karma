

from datetime import datetime
from enum import Enum
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from backend.app.dto.trip_stop import TripStopStatus


class SkipReason(str, Enum):
    CUSTOMER_NOT_AVAILABLE = "customer_not_available"
    VEHICLE_BREAKDOWN = "vehicle_breakdown"
    WEATHER_CONDITIONS = "weather_conditions"
    PRODUCT_OUT_OF_STOCK = "product_out_of_stock"
    OTHER = "other"

class NoSaleReason(str, Enum):
    CUSTOMER_REFUSED = "customer_refused"
    PRICE_TOO_HIGH = "price_too_high"
    QUALITY_ISSUES = "quality_issues"
    OTHER = "other"


class TripStopOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skip_reason: Optional[SkipReason] = None
    no_sale_reason: Optional[NoSaleReason] = None

    @model_validator(mode="after")
    def check_skip_and_no_sale(self):
        if self.skip_reason and self.no_sale_reason:
            raise BadRequestError("Cannot have both skip_reason and no_sale_reason set.")
        return self



class TripStopOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = TripStopOperatorSchema(**payload.result)

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        trip_stop = self.get_trip_stop(uow=uow)
        if operator_schema.skip_reason:
            trip_stop.status = TripStopStatus.SKIPPED.value
            trip_stop.skip_reason = operator_schema.skip_reason.value
        elif operator_schema.no_sale_reason:
            trip_stop.status = TripStopStatus.COMPLETED.value
            trip_stop.no_sale_reason = operator_schema.no_sale_reason.value

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


    def get_trip_stop(self,uow:SqlAlchemyUnitOfWork):

        trip_stop_uuid = self.task_exe.task_inputs.data.get("trip_stop_uuid")

        trip_stop = uow.trip_stop_repository.find_one(
            uuid=trip_stop_uuid,
            is_deleted=False
        )
        if not trip_stop:
            raise BadRequestError(f"TripStop not found with uuid: {trip_stop_uuid}")

        return trip_stop




