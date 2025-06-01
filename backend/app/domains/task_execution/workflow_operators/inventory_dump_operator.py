from datetime import datetime
from typing import Optional

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import ConfigDict, BaseModel
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import WorkflowStatus
from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventCreate, InventoryEventType


class InventoryDumpOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inventory_uuid: str  # UUID of the inventory to be dumped
    quantity: float  # Quantity of the inventory to be dumped



class InventoryDumpOperator(OperatorInterface):

    def execute(self,
                uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameters: Optional[dict] = None,
                *args,
                **kwargs):

        operator_schema = InventoryDumpOperatorSchema(**payload.result)
        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")

        # dump
        self.dump_inventory(
            uow=uow,
            operator_schema=operator_schema,
            payload=payload,
        )
        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid
        uow.task_execution_repository.save(task_exe, commit=False)


    def dump_inventory(self,
                        uow: SqlAlchemyUnitOfWork,
                        operator_schema: InventoryDumpOperatorSchema,
                        payload: TaskExecutionComplete,
                       ):

        InventoryEventDomain.create_inventory_event(
            uow=uow,
            payload=InventoryEventCreate(
                inventory_uuid=operator_schema.inventory_uuid,
                quantity=-abs(operator_schema.quantity),
                event_type=InventoryEventType.MANUAL.value,
                affect_original=False,
                notes=f"Inventory dumped by operator with task execution UUID: {payload.uuid}",
            ),
        )

