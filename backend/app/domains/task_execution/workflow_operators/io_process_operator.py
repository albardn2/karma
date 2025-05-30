from datetime import datetime
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)

class InputItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_uuid: str
    quantity: float

class OutputItem(BaseModel):
    material_uuid: str
    quantity: float
    inventory_uuid: Optional[str] = None


class IOProcessOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    process_inputs: Optional[list[InputItem]] = None
    process_outputs: Optional[list[OutputItem]] = None

    @model_validator(mode="after")
    def validate_process_data(self) -> "IOProcessOperatorSchema":
        if not self.process_inputs and not self.process_outputs:
            raise ValueError("At least one process input or output must be provided.")
        return self


class IOProcessOperator(OperatorInterface):

    def execute(self,uow, payload:TaskExecutionComplete, *args, **kwargs):

        # load the operator schema
        operator_schema = IOProcessOperatorSchema(**payload.result)

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



