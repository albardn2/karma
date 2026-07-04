from datetime import datetime
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork




class StartTripOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # manual mode: the driver adds stops ad hoc during the trip; only the
    # vehicle and assigned user are needed (routing inputs are skipped)
    manual_stops: Optional[bool] = False
    service_areas: Optional[list[str]] = None
    start_warehouse_name: Optional[str] = None
    end_warehouse_name: Optional[str] = None
    vehicle_plate: str
    last_visit_threshold_days: Optional[int] = None
    start_point: Optional[str] = None
    end_point: Optional[str] = None
    assigned_user_uuid: Optional[str] = None
    customer_categories: Optional[list[str]] = None
    max_stops: Optional[int] = None
    min_stops: Optional[int] = None

    @field_validator("manual_stops", mode="before")
    def coerce_manual_stops(cls, v):
        # the form may send a checklist (list of picked options) or a string
        if isinstance(v, list):
            return len(v) > 0
        if isinstance(v, str):
            return v.strip().lower() in ("yes", "true", "1", "enabled")
        return bool(v)

    @model_validator(mode="after")
    def check_required_by_mode(self):
        if self.manual_stops:
            if not self.assigned_user_uuid:
                raise BadRequestError("assigned_user_uuid is required when manual_stops is enabled")
        else:
            missing = [
                name for name in
                ("service_areas", "start_warehouse_name", "end_warehouse_name", "last_visit_threshold_days")
                if not getattr(self, name)
            ]
            if missing:
                raise BadRequestError(f"Missing required fields for routed trip: {', '.join(missing)}")
        return self


class StartTripOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = StartTripOperatorSchema(**payload.result)

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

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



