from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError

from app.dto.workflow_execution import (
    WorkflowExecutionCreate,
    WorkflowExecutionRead,
    WorkflowStatus
)
from models.common import WorkflowExecution as WorkflowExecutionModel
from app.domains.task_execution.domain import TaskExecutionDomain


class WorkflowExecutionDomain:

    @staticmethod
    def create_workflow_execution(uow: SqlAlchemyUnitOfWork, payload: WorkflowExecutionCreate) -> WorkflowExecutionRead:
        workflow_uuid = payload.workflow_uuid

        workflow = uow.workflow_repository.find_one(uuid=workflow_uuid, is_deleted=False)
        if not workflow:
            raise NotFoundError(f"Workflow not found with uuid: {workflow_uuid}")

        # use workflow parameters and update if the same key exists in payload
        parameters = workflow.parameters or {}
        if payload.parameters:
            for key, value in payload.parameters.items():
                parameters[key] = value
        payload.parameters = parameters

        workflow = WorkflowExecutionModel(
            workflow_uuid=workflow_uuid,
            parameters=payload.parameters or {},
            created_by_uuid=payload.created_by_uuid,
            status=WorkflowStatus.IN_PROGRESS.value,  # Default status when creating a new execution
            result={},
            error_message=None,
            start_time= datetime.now(),
            end_time=None
        )
        uow.workflow_repository.save(model=workflow, commit=False)
        TaskExecutionDomain.create_task_executions(uow=uow, workflow_execution_uuid=workflow.uuid)

        return WorkflowExecutionRead.from_orm(workflow)

    @staticmethod
    def cancel_workflow_execution(
        uow: SqlAlchemyUnitOfWork, uuid: str
    ) -> WorkflowExecutionRead:
        workflow_execution = uow.workflow_execution_repository.find_one(uuid=uuid)
        if not workflow_execution:
            raise NotFoundError(f"WorkflowExecution not found with uuid: {uuid}")

        if workflow_execution.status in [WorkflowStatus.COMPLETED.value, WorkflowStatus.CANCELLED.value, WorkflowStatus.FAILED.value]:
            raise BadRequestError("Cannot cancel a completed or already cancelled workflow execution")

        workflow_execution.status = WorkflowStatus.CANCELLED.value
        workflow_execution.end_time = datetime.now()
        workflow_execution.error_message = "Workflow execution was cancelled by user"
        uow.workflow_execution_repository.save(model=workflow_execution, commit=False)

        TaskExecutionDomain.cancel_task_executions(workflow_execution_uuid=workflow_execution.uuid, uow=uow)

        # refresh
        # uow.session.refresh(workflow_execution)
        return WorkflowExecutionRead.from_orm(workflow_execution)
