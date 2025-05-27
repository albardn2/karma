from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from models.common import Task as TaskModel

from app.dto.task import TaskCreate, TaskRead, TaskUpdate, TaskListParams, TaskPage


class TaskDomain:


    @staticmethod
    def create_task(uow: SqlAlchemyUnitOfWork, payload: TaskCreate) -> TaskRead:
        data = payload.model_dump()
        task = TaskModel(**data)
        TaskDomain.validate_unique_name_in_workflow(uow=uow, workflow_uuid=task.workflow_uuid, name=task.name)
        TaskDomain.validate_depends_on(uow=uow, payload=payload)
        uow.task_repository.save(model=task, commit=False)
        return TaskRead.from_orm(task)

    @staticmethod
    def update_task(uow: SqlAlchemyUnitOfWork, uuid: str, payload: TaskUpdate) -> TaskRead:
        task = uow.task_repository.find_one(uuid=uuid, is_deleted=False)
        if not task:
            raise NotFoundError('Task not found')

        if payload.name and payload.name != task.name:
            TaskDomain.validate_unique_name_in_workflow(uow=uow, workflow_uuid=task.workflow_uuid, name=payload.name)
        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(task, field, val)

        if payload.depends_on:
            TaskDomain.validate_depends_on(uow=uow, payload=task)

        uow.task_repository.save(model=task, commit=False)

        return TaskRead.from_orm(task)

    @staticmethod
    def delete_task(uow: SqlAlchemyUnitOfWork, uuid: str) -> TaskRead:
        task = uow.task_repository.find_one(uuid=uuid, is_deleted=False)
        if not task:
            raise NotFoundError('Task not found')

        task.is_deleted = True
        uow.task_repository.save(model=task, commit=False)
        return TaskRead.from_orm(task)

    @staticmethod
    def validate_unique_name_in_workflow(uow: SqlAlchemyUnitOfWork, workflow_uuid:str,name:str) -> bool:
        """
        Validate that the workflow name is unique.
        If uuid is provided, it will exclude that workflow from the check.
        """
        existing_workflow = uow.workflow_repository.find_one(uuid=workflow_uuid,is_deleted=False)
        if not existing_workflow:
            raise NotFoundError(f"Workflow with uuid '{workflow_uuid}' not found.")

        for task in existing_workflow.tasks:
            if task.name == name:
                raise BadRequestError(f"Task with name '{name}' already exists in workflow '{workflow_uuid}'.")


    @staticmethod
    def validate_depends_on(uow: SqlAlchemyUnitOfWork, payload:TaskCreate):
        if payload.depends_on:
            for task_name in payload.depends_on:
                existing_task = uow.task_repository.find_one(name=task_name,
                                                             workflow_uuid=payload.workflow_uuid,
                                                             is_deleted=False)
                if not existing_task:
                    raise BadRequestError(f"Task with name {task_name} does not exist.")
