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

from app.dto.task_execution import TaskExecutionComplete
from app.domains.task_execution.workflow_operators.operator_entry_point import OperatorEntryPoint
from app.domains.task_execution.callback_functions import CALLBACK_FN_MAPPER
from app.dto.task_execution import TaskExecutionCreate


class TaskExecutionDomain:

    @staticmethod
    def create_task_execution(uow:SqlAlchemyUnitOfWork,payload:TaskExecutionCreate) -> TaskExecutionRead:
        data = payload.model_dump()
        task_execution = TaskExecutionModel(**data)
        uow.task_execution_repository.save(model=task_execution, commit=False)
        return TaskExecutionRead.from_orm(task_execution)

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

            for child in task_execution.children:
                if child.status not in [WorkflowStatus.COMPLETED.value, WorkflowStatus.CANCELLED.value, WorkflowStatus.FAILED.value]:
                    child.status = WorkflowStatus.CANCELLED.value
                    child.end_time = datetime.now()
                    child.error_message = "Task execution was cancelled by user"
                    uow.task_execution_repository.save(model=child, commit=False)
            task_execution.status = WorkflowStatus.CANCELLED.value
            task_execution.end_time = datetime.now()
            task_execution.error_message = "Task execution was cancelled by user"
            uow.task_execution_repository.save(model=task_execution, commit=False)

    @staticmethod
    def complete_task_execution(uow: SqlAlchemyUnitOfWork,
                                payload:TaskExecutionComplete) -> TaskExecutionRead:

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise NotFoundError(f"TaskExecution not found with uuid: {payload.uuid}")

        if task_exe.status in [WorkflowStatus.CANCELLED.value, WorkflowStatus.FAILED.value,WorkflowStatus.NOT_STARTED]:
            raise BadRequestError(f"TaskExecution cannot be completed with status: {task_exe.status}")

        # execute
        OperatorEntryPoint().execute(
            uow=uow,
            payload=payload,
            operator_type=task_exe.task.operator,
            parameters=task_exe.workflow_execution.parameters,
        )
        uow.task_execution_repository.save(model=task_exe, commit=False)
        for fn_name in task_exe.callback_fns:
            CALLBACK_FN_MAPPER[fn_name](uow=uow,
                                        task_execution_uuid=task_exe.uuid)

        # If the task execution is completed, unblock dependent tasks
        TaskExecutionDomain.unblock_dependent_task_executions(
            uow=uow, task_execution=task_exe
        )
        return TaskExecutionRead.from_orm(task_exe)

    @staticmethod
    def unblock_dependent_task_executions(
        uow: SqlAlchemyUnitOfWork, task_execution: TaskExecutionModel
    ):
        """
        Unblock dependent task executions by setting their status to IN_PROGRESS.
        """
        if task_execution.status != WorkflowStatus.COMPLETED.value:
            raise BadRequestError(f"TaskExecution with uuid {task_execution.uuid} is not completed.")

        # Find all dependent task executions
        workflow_exe_tasks = task_execution.workflow_execution.task_executions
        name_status_mapper = {task.name: task.status for task in workflow_exe_tasks}

        # now loop through the tasks and mark in progress if dependent names are completed
        for task in workflow_exe_tasks:
            if task.depends_on and all(name_status_mapper[dep] == WorkflowStatus.COMPLETED.value for dep in task.depends_on):
                TaskExecutionDomain.mark_dependent_task_in_progress(uow=uow, dependent_task=task)

    @staticmethod
    def mark_dependent_task_in_progress(
        uow: SqlAlchemyUnitOfWork, dependent_task: TaskExecutionModel
    ):
        """
        Mark a dependent task as IN_PROGRESS if all its dependencies are completed.
        """
        dependent_task.status = WorkflowStatus.IN_PROGRESS.value
        dependent_task.start_time = datetime.now()
        uow.task_execution_repository.save(model=dependent_task, commit=False)