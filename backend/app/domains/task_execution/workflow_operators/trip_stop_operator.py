

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
from app.dto.trip_stop import TripStopStatus


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

    outcome: str
    mixed_large_extra: Optional[float] = None
    mixed_large: Optional[float] = None
    mixed_small: Optional[float] = None
    notes: Optional[str] = None

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
        self.task_exe = task_exe

        trip_stop = self.get_trip_stop(uow=uow)
        trip_stop.outcome = operator_schema.outcome
        sales_outcome = {
            "mixed_large_extra": operator_schema.mixed_large_extra,
            "mixed_large": operator_schema.mixed_large,
            "mixed_small": operator_schema.mixed_small
        }
        trip_stop.sales_outcome = sales_outcome
        trip_stop.notes = operator_schema.notes
        uow.trip_stop_repository.save(trip_stop, commit=False)
        # one timestamp for the whole completion, so the customer's last_stop is
        # exactly the task execution's end_time rather than a few milliseconds
        # off it — the backfill reads end_time, and the two must agree
        completed_at = datetime.now()
        self.tag_customer_from_outcome(uow=uow, trip_stop=trip_stop,
                                       outcome=operator_schema.outcome,
                                       actor_uuid=payload.completed_by_uuid,
                                       completed_at=completed_at)
        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = completed_at
        task_exe.completed_by_uuid = payload.completed_by_uuid

        # Save the task execution with the result
        uow.task_execution_repository.save(task_exe, commit=False)

    def tag_customer_from_outcome(self, uow: SqlAlchemyUnitOfWork, trip_stop,
                                  outcome: str, actor_uuid=None,
                                  completed_at=None) -> None:
        """Turn what the rep reported into tags and visit dates on the customer.

        The outcome the rep already picks is the cheapest interest signal the
        business has, so the customer_interest tag follows it rather than asking
        anyone to maintain the same fact twice. blacklist and
        interested:prioritize_next_visit additionally raise their own flags.

        Completing a stop also SPENDS prioritize_next_stop: the visit that flag
        was asking for is this one. A stop with no customer (trip_stop
        .customer_uuid is nullable) tags nothing. Re-completing a stop with a
        corrected outcome moves the tags again, which is the intended
        behaviour: the latest verdict wins.
        """
        from app.domains.customer.auto_tags import (
            apply_auto_tags, is_effective_outcome, tags_cleared_by_outcome,
            tags_for_outcome,
        )

        if not trip_stop.customer_uuid:
            return
        customer = uow.customer_repository.find_one(uuid=trip_stop.customer_uuid, is_deleted=False)
        if not customer:
            return

        # the visit dates move on EVERY completion, including a skipped one for
        # last_stop — "we went and could not get in" is still a trip made, and a
        # planner needs to know it happened
        if completed_at is not None:
            customer.last_stop = completed_at
            if is_effective_outcome(outcome):
                customer.last_effective_stop = completed_at
            uow.customer_repository.save(model=customer, commit=False)

        tags = tags_for_outcome(outcome)
        clear = tags_cleared_by_outcome(outcome)
        if tags or clear:
            apply_auto_tags(uow, customer=customer, tags=tags, clear=clear, actor_uuid=actor_uuid)

    def validate(self):
        raise NotImplementedError("The validate method must be implemented by subclasses.")

    @property
    def name(self) -> str:
        # name of class
        return self.__class__.__name__


    def get_trip_stop(self,uow:SqlAlchemyUnitOfWork):

        trip_stop_uuid = self.task_exe.task_inputs.get("data", {}).get("trip_stop_uuid")
        trip_stop = uow.trip_stop_repository.find_one(
            uuid=trip_stop_uuid,
        )
        if not trip_stop:
            raise BadRequestError(f"TripStop not found with uuid: {trip_stop_uuid}")

        return trip_stop




