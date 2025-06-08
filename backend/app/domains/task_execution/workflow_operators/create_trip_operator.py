

from datetime import datetime
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.trip.domain import TripDomain
from app.dto.task_execution import OperatorType
from app.dto.trip import TripCreate, TripStatus

from backend.app.domains.task.domain import TaskDomain
from backend.app.domains.task_execution.domain import TaskExecutionDomain
from backend.app.domains.trip_stop.domain import TripStopDomain
from backend.app.dto.task import TaskCreate, TaskInput
from backend.app.dto.task_execution import TaskExecutionCreate
from backend.app.dto.trip import TripData, InventoryInput
from backend.app.dto.trip_stop import TripStopCreate, TripStopStatus
from backend.app.utils.geom_utils import wkt_or_wkb_to_lat_lon


class CreateTripOperatorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pass

class CreateTripOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = CreateTripOperatorSchema(**payload.result)

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")
        self.task_exe = task_exe
        self.all_tasks_executions = task_exe.workflow_execution.tasks_executions
        TripDomain.create_trip(uow=uow,
                               payload=TripCreate(
                                   created_by_uuid=payload.completed_by_uuid,
                                   vehicle_uuid=self.get_vehicle_uuid(),
                                   service_area_uuid=self.get_service_area_uuid(),
                                   status=TripStatus.IN_PROGRESS.value,
                                   start_warehouse_uuid=self.get_start_warehouse_uuid(),
                                   end_warehouse_uuid= self.get_end_warehouse_uuid(),
                                   start_time=datetime.now(),
                                   data = self.get_trip_data().model_dump(mode="json"),
                                   workflow_execution_uuid=task_exe.workflow_execution.uuid,
                               ))

        # create trip stops
        created_task_names = []
        for customer_uuid in self.get_customer_uuids():
            customer = uow.customer_repository.find_one(
                uuid=customer_uuid,
                is_deleted=False
            )
            if not customer:
                raise BadRequestError(f"Customer not found with uuid: {customer_uuid}")

            trip_stop = TripStopDomain.create_trip_stop(
                uow=uow,
                payload=TripStopCreate(
                    created_by_uuid=payload.completed_by_uuid,
                    trip_uuid=task_exe.workflow_execution.trip.uuid,
                    coordinates=wkt_or_wkb_to_lat_lon(customer.coordinates),
                    customer_uuid=customer_uuid,
                    status=TripStopStatus.IN_PROGRESS.value
                )
            )

            task_input = TaskInput(
                data = {"trip_stop_uuid":trip_stop.uuid}
            )

            task_create = TaskDomain.create_task(
                uow=uow,
                payload=TaskCreate(
                    name=f"trip_stop_{customer.name}:{customer_uuid}",
                    created_by_uuid=payload.completed_by_uuid,
                    workflow_uuid = task_exe.workflow_execution.workflow_uuid,
                    parent_task_uuid=self.get_trip_operator_task_uuid(),
                    operator= OperatorType.TRIP_STOP_OPERATOR.value,
                    task_inputs =task_input,
                    depends_on = [] if not created_task_names else [created_task_names[-1]],
                    callback_fns = [],
                )
            )
            created_task_names.append(task_create.name)

            depends_on = task_create.depends_on or []
            task_execution = TaskExecutionDomain.create_task_execution(
                uow=uow,
                payload=TaskExecutionCreate(
                    status = WorkflowStatus.NOT_STARTED.value if depends_on else WorkflowStatus.IN_PROGRESS.value,
                    depends_on=depends_on,
                    start_time=datetime.now() if not depends_on else None,
                    task_uuid=task_create.uuid,
                    workflow_execution_uuid=task_exe.workflow_execution.uuid,
                    created_by_uuid=payload.completed_by_uuid,
                    parent_task_execution_uuid= self.get_trip_operator_task_execution_uuid()

            ))


        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid
        uow.task_execution_repository.save(task_exe, commit=False)

    def validate(self):
        raise NotImplementedError("The validate method must be implemented by subclasses.")

    @property
    def name(self) -> str:
        # name of class
        return self.__class__.__name__


    def get_service_area_uuid(self) -> str:
        """
        This method is a placeholder for retrieving the service area UUID.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("service_area_uuid")

    def get_vehicle_uuid(self) -> str:
        """
        This method is a placeholder for retrieving the service area UUID.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("vehicle_uuid")

    def get_start_warehouse_uuid(self) -> str:
        """
        This method is a placeholder for retrieving the service area UUID.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("start_warehouse_uuid")

    def get_end_warehouse_uuid(self) -> str:
        """
        This method is a placeholder for retrieving the service area UUID.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("end_warehouse_uuid")

    def get_trip_data(self) -> TripData:
        """
        This method is a placeholder for retrieving the trip data.
        It should be implemented to return the actual trip data.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.TRIP_ADD_INVENTORY_OPERATOR.value:
                inventory_input_list = task_exe.result.get("inventory")
                trip_data = TripData(
                    input_inventory=[
                        InventoryInput(
                            inventory_uuid=item.get("inventory_uuid"),
                            quantity=item.get("quantity"),
                            material_name=item.get("material_name"),
                            lot_id=item.get("lot_id")
                        ) for item in inventory_input_list
                    ]

                )
                return trip_data


    def get_customer_uuids(self) -> list[str]:
        """
        This method is a placeholder for retrieving the customer UUIDs.
        It should be implemented to return the actual customer UUIDs.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.TRIP_ROUTE_OPERATOR.value:
                return task_exe.result.get("customer_uuids", [])


    def get_trip_operator_task_execution_uuid(self):
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.TRIP_OPERATOR.value:
                return task_exe.uuid

    def get_trip_operator_task_uuid(self):
        for task_exe in self.all_tasks_executions:
            if task_exe.operator_name == OperatorType.TRIP_OPERATOR.value:
                return task_exe.task.uuid


