from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.task_execution import TaskExecutionRead
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.task_execution import OperatorType
from app.dto.workflow_execution import WorkflowStatus
from app.domains.task_execution.workflow_operators.qc_operator import QCOperatorSchema
from app.entrypoint.routes.common.errors import BadRequestError
from app.domains.quality_control.domain import QualityControlDomain
from app.dto.quality_control import QualityControlCreate
from app.dto.quality_control import QualityControlType


def quality_control_create(
        uow: SqlAlchemyUnitOfWork,
        task_execution_uuid: str,
) -> TaskExecutionRead:
    """
    Create task executions from a workflow execution.
    """

    # process inputs
    task_execution = uow.task_execution_repository.find_one(uuid=task_execution_uuid)
    if not task_execution:
        raise NotFoundError(f"TaskExecution not found with uuid: {task_execution_uuid}")

    worfklow_execution = task_execution.workflow_execution
    parameters = worfklow_execution.parameters
    all_executions = [exe for exe in worfklow_execution.task_executions if exe.operator== OperatorType.QC_OPERATOR.value]
    for execution in all_executions:
        if execution.status != WorkflowStatus.COMPLETED.value:
            raise BadRequestError(
                f"TaskExecution with uuid {execution.uuid} is not completed."
            )
        operator_schema = QCOperatorSchema(**execution.result)

        # create quality control entry
        QualityControlDomain.create_quality_control(
            uow=uow,
            payload=QualityControlCreate(
                created_by_uuid=task_execution.created_by_uuid,
                process_uuid=worfklow_execution.processes[0].uuid,
                type=QualityControlType(parameters.get("qc_type")),
                data=operator_schema.model_dump(mode="json")
            )
        )


