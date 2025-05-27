from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from app.dto.task_execution import TaskExecutionRead
from models.common import TaskExecution as TaskExecutionModel
from app.dto.workflow_execution import (
    WorkflowExecutionCreate,
    WorkflowExecutionRead,
    WorkflowStatus
)

class TaskExecutionDomain:

    @staticmethod
    def create_task_executions(uow: SqlAlchemyUnitOfWork, workflow_execution_uuid:str) -> TaskExecutionRead:

        workflow_execution = uow.workflow_execution_repository.find_one(
            uuid=workflow_execution_uuid
        )
        if not workflow_execution:
            raise NotFoundError(f"WorkflowExecution not found with uuid: {workflow_execution_uuid}")

        # Assuming tasks are part of the workflow execution and can be accessed
        tasks = workflow_execution.workflow.tasks
        if not tasks:
            raise BadRequestError("No tasks found in the workflow execution")

        task_executions = []
        for task in tasks:
            task_execution = TaskExecutionModel(
                workflow_execution_uuid=workflow_execution_uuid,
                created_by_uuid=workflow_execution.created_by_uuid,
                task_uuid=task.uuid,
                status=WorkflowStatus.NOT_STARTED.value,  # Default status when creating a new execution
                start_time=datetime.now(),
                end_time=None,
                result={},
                error_message=None,
                depends_on=task.depends_on,
            )
            task_executions.append(task_execution)
        TaskExecutionDomain.set_status_on_create(task_executions)
        uow.task_execution_repository.batch_save(task_executions, commit=False)

    @staticmethod
    def set_status_on_create(tasks: list[TaskExecutionModel]):
        for task in tasks:
            if not task.depends_on:
                task.status = WorkflowStatus.IN_PROGRESS.value
                task.start_time = datetime.now()


    @staticmethod
    def cancel_task_executions(
        uow: SqlAlchemyUnitOfWork, workflow_execution_uuid: str
    ) -> TaskExecutionRead:
        workflow_execution = uow.workflow_execution_repository.find_one(
            uuid=workflow_execution_uuid
        )
        if not workflow_execution:
            raise NotFoundError(f"WorkflowExecution not found with uuid: {workflow_execution_uuid}")

        task_executions = uow.task_execution_repository.find_all(
            workflow_execution_uuid=workflow_execution_uuid
        )
        if not task_executions:
            raise NotFoundError(f"No task executions found for workflow execution uuid: {workflow_execution_uuid}")
        for task_execution in task_executions:
            if task_execution.status in [WorkflowStatus.COMPLETED.value, WorkflowStatus.CANCELLED.value, WorkflowStatus.FAILED.value]:
                continue

            task_execution.status = WorkflowStatus.CANCELLED.value
            task_execution.end_time = datetime.now()
            task_execution.error_message = "Task execution was cancelled by user"
            uow.task_execution_repository.save(model=task_execution, commit=False)

