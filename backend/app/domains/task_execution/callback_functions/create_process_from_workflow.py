from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.task_execution import TaskExecutionRead
from app.dto.workflow_execution import WorkflowStatus

from app.domains.task_execution.workflow_operators.io_process_operator import IOProcessOperatorSchema
from app.dto.task_execution import OperatorType
from app.entrypoint.routes.common.errors import BadRequestError
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.process import ProcessInputItem, ProcessOutputItem

from app.domains.process.domain import ProcessDomain
from app.dto.process import InputsUsedItem, ProcessData, ProcessCreate


def create_process_from_workflow(
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

    # Assuming task_execution.result contains the necessary data to create a process

    process_inputs = []
    process_outputs = []

    worfklow_execution = task_execution.workflow_execution
    all_executions = [exe for exe in worfklow_execution.task_executions if exe.operator== OperatorType.IO_PROCESS_OPERATOR.value]
    for execution in all_executions:
        if execution.status != WorkflowStatus.COMPLETED.value:
            raise BadRequestError(
                f"TaskExecution with uuid {execution.uuid} is not completed."
            )
        operator_schema = IOProcessOperatorSchema(**execution.result)
        process_inputs.extend(operator_schema.process_inputs or [])
        process_outputs.extend(operator_schema.process_outputs or [])

    if not process_inputs and not process_outputs:
        raise BadRequestError("At least one process input or output must be provided.")


    process_type = worfklow_execution.parameters.get("process_type")
    if not process_type:
        raise BadRequestError("Process type is required in workflow parameters.")

    output_warehouse_uuid = worfklow_execution.parameters.get("output_warehouse_uuid")
    if not output_warehouse_uuid:
        raise BadRequestError("Output warehouse UUID is required in workflow parameters.")


    inputs = [
        ProcessInputItem(
            inventory_uuid=i.inventory_uuid,
            quantity=i.quantity,
        ) for i in process_inputs
    ]

    total_output_quantity = sum(o.quantity for o in process_outputs)

    outputs = []
    for o in process_outputs:

        inputs_used = []
        for i in inputs:
            used = InputsUsedItem(
                inventory_uuid=i.inventory_uuid,
                quantity=i.quantity * (o.quantity / total_output_quantity)
            )
            inputs_used.append(used)

        outputs.append(
            ProcessOutputItem(
                inputs_used=inputs_used,
                material_uuid=o.material_uuid,
                quantity=o.quantity,
                inventory_uuid=o.inventory_uuid,
            )
        )

    proc_create = ProcessCreate(
        workflow_execution_uuid=task_execution.workflow_execution_uuid,
        type=process_type,
        data=ProcessData(
            inputs=inputs,
            outputs=outputs,
            output_warehouse_uuid=output_warehouse_uuid
        ),
        created_by_uuid=task_execution.created_by_uuid
    )

    dto = ProcessDomain.create_process(
        uow=uow,
        payload=proc_create
    )





