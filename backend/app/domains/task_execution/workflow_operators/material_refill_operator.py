from datetime import datetime
from typing import Optional

from app.domains.workflow.operators.interface import OperatorInterface
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.task_execution import TaskExecutionComplete
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import WorkflowStatus
from pydantic import BaseModel, ConfigDict
from app.domains.process.domain import ProcessDomain
from app.dto.process import ProcessInputItem


class MaterialRefillOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inventory_uuid: str
    quantity: float


class MaterialRefillOperator(OperatorInterface):

    def execute(self,
                uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameters: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = MaterialRefillOperatorSchema(**payload.result)
        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")


        # Modify process inputs based on the operator schema
        self.modify_process_inputs(
            uow=uow,
            payload=payload,
            operator_schema=operator_schema,
            parameters=parameters
        )
        # Update the task execution with the result

        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid
        uow.task_execution_repository.save(task_exe, commit=False)


    def modify_process_inputs(self,
                                uow: SqlAlchemyUnitOfWork,
                                payload: TaskExecutionComplete,
                                operator_schema: MaterialRefillOperatorSchema,
                                parameters: Optional[dict] = None,
                              ):

        inventory = uow.inventory_repository.find_one(uuid=operator_schema.inventory_uuid, is_deleted=False)
        if not inventory:
            raise BadRequestError(f"Inventory not found with uuid: {operator_schema.inventory_uuid}")

        material_uuid = inventory.material_uuid
        processes = uow.process_repository.find_filtered_excluding_input_material(
            material_uuid=material_uuid,
            process_type=parameters.get("process_type"),
            created_at_from=None,
            created_at_to=None,
        )
        if not processes:
            raise BadRequestError(f"No processes found for material {material_uuid}.")

        # split quantity evenly
        quantity_per_process = operator_schema.quantity / len(processes)

        for process in processes:
            process_input = ProcessInputItem(
                inventory_uuid=operator_schema.inventory_uuid,
                material_uuid=material_uuid,
                quantity=quantity_per_process
            )
            ProcessDomain.add_process_input(
                uow=uow,
                process_uuid=process.uuid,
                input_data=process_input
            )

        uow.process_repository.batch_save(models=processes, commit=False)















    def validate(self):
        raise NotImplementedError("The validate method must be implemented by subclasses.")

    @property
    def name(self) -> str:
        # name of class
        return self.__class__.__name__
