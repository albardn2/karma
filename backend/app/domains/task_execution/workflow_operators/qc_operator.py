from datetime import datetime
from typing import Optional
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import WorkflowStatus


class ChecklistItem(BaseModel):
    name: str  # Name of the checklist item
    passed: bool  # Whether the checklist item passed or failed
class QCOperatorSchema(BaseModel):
    checklist: list[ChecklistItem]  # List of quality control checks to be performed



class QualityControlOperator:

    def execute(self,
                uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameters: Optional[dict] = None,
                *args,
                **kwargs):

        """
        Executes the quality control operation.

        :param uow: The unit of work instance.
        :param payload: The data to be processed.
        :return: The result of the quality control operation.
        """
        # load the operator schema
        operator_schema = QCOperatorSchema(**payload.result)
        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid
        uow.task_execution_repository.save(task_exe, commit=False)
