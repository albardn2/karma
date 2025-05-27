from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from app.dto.workflow import WorkflowCreate, WorkflowRead
from models.common import Workflow as WorkflowModel


class WorkflowDomain:


    @staticmethod
    def create_workflow(uow: SqlAlchemyUnitOfWork, payload: WorkflowCreate) -> WorkflowRead:
        data = payload.model_dump()
        workflow = WorkflowModel(**data)
        WorkflowDomain.validate_unique_name(uow=uow, name=workflow.name)

        uow.workflow_repository.save(model=workflow, commit=False)
        return WorkflowRead.from_orm(workflow)

    @staticmethod
    def update_workflow(uow: SqlAlchemyUnitOfWork, uuid: str, payload: WorkflowCreate) -> WorkflowRead:
        workflow = uow.workflow_repository.find_one(uuid=uuid, is_deleted=False)
        if not workflow:
            raise NotFoundError('Workflow not found')

        WorkflowDomain.validate_unique_name(uow=uow, name=payload.name, uuid=uuid)
        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(workflow, field, val)

        uow.workflow_repository.save(model=workflow, commit=False)
        return WorkflowRead.from_orm(workflow)


    @staticmethod
    def delete_workflow(uow: SqlAlchemyUnitOfWork, uuid: str) -> WorkflowRead:
        workflow = uow.workflow_repository.find_one(uuid=uuid, is_deleted=False)
        if not workflow:
            raise NotFoundError('Workflow not found')

        workflow.is_deleted = True
        uow.workflow_repository.save(model=workflow, commit=False)
        return WorkflowRead.from_orm(workflow)

    @staticmethod
    def validate_unique_name(uow: SqlAlchemyUnitOfWork, name: str, uuid: str = None) -> bool:
        """
        Validate that the workflow name is unique.
        If uuid is provided, it will exclude that workflow from the check.
        """
        existing_workflow = uow.workflow_repository.find_first(name=name)
        if existing_workflow and (uuid is None or existing_workflow.uuid != uuid):
            raise BadRequestError(f"Workflow with name '{name}' already exists.")
