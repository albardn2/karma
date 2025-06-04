from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.task_execution import TaskExecutionRead
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError
from sqlalchemy.orm.attributes import flag_modified
from app.domains.task_execution.workflow_operators.io_process_operator import IOProcessOperatorSchema, InputItem


def consume_packaging_from_output(
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

    if not parameters:
        raise BadRequestError("No parameters found in workflow execution.")

    # get mapper from parameters
    mapper = parameters.get("material_to_package_mapper")
    if not mapper:
        raise BadRequestError("No material to package mapper found in workflow execution parameters.")

    operator_schema = IOProcessOperatorSchema(**task_execution.result)
    packaging_inputs = []
    for output in operator_schema.process_outputs:
        output_material_uuid = output.material_uuid
        output_quantity = output.quantity

        if output_material_uuid not in mapper:
            continue

        package_material_uuid = mapper[output_material_uuid][0]
        package_quantity = mapper[output_material_uuid][1] * output_quantity # ratio(package_quantity/output_quantity) * output_quantity

        # get active inventories for material
        packaging_inventories = uow.inventory_repository.find_all(is_active=True,material_uuid=package_material_uuid,is_deleted=False)

        # loop through inventories and create packaging_inputs
        left_quantity = package_quantity
        print(f"left_quantity: {left_quantity}, package_material_uuid: {package_material_uuid}, output_material_uuid: {output_material_uuid}")
        for inventory in packaging_inventories:
            if left_quantity <= 0:
                break

            if inventory.current_quantity <= 0:
                print(f"Inventory {inventory.uuid} has no current quantity, skipping.")
                continue

            if inventory.current_quantity >= left_quantity:
                item = InputItem(
                    inventory_uuid=inventory.uuid,
                    quantity=left_quantity)
                packaging_inputs.append(item)
                left_quantity = 0
            else:
                item = InputItem(
                    inventory_uuid=inventory.uuid,
                    quantity=inventory.current_quantity)
                packaging_inputs.append(item)
                left_quantity -= inventory.current_quantity

    if not packaging_inputs:
        raise BadRequestError("No packaging inputs found based on the provided mapper.")

    operator_schema.process_inputs.extend(packaging_inputs)
    task_execution.result = operator_schema.model_dump(mode="json")
    flag_modified(task_execution, "result")






















