

from datetime import datetime
from typing import Optional

from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)
from geoalchemy2.shape import to_shape

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.trip.distribution_algo import DistributionAlgorithm


class TripRouteOperatorSchema(BaseModel):
    service_area_uuid: str
    start_warehouse_uuid: str
    end_warehouse_uuid: str

    # result
    customer_uuids: Optional[list[str]] = None
    waypoints: Optional[list[tuple[float, float]]] = None
    route_coordinates: Optional[list[tuple[float, float]]] = None


class TripRouteOperator(OperatorInterface):

    def execute(self,uow:SqlAlchemyUnitOfWork,
                payload:TaskExecutionComplete,
                parameter: Optional[dict] = None,
                *args, **kwargs):

        # load the operator schema
        operator_schema = TripRouteOperatorSchema(**payload.result)

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")


        service_area = uow.service_area_repository.find_one(
            uuid=operator_schema.service_area_uuid,
            is_deleted=False
        )
        if not service_area:
            raise BadRequestError(f"ServiceArea not found with uuid: {operator_schema.service_area_uuid}")

        start_warehouse = uow.warehouse_repository.find_one(
            uuid=operator_schema.start_warehouse_uuid,
            is_deleted=False
        )
        if not start_warehouse:
            raise BadRequestError(f"Start Warehouse not found with uuid: {operator_schema.start_warehouse_uuid}")
        end_warehouse = uow.warehouse_repository.find_one(
            uuid=operator_schema.end_warehouse_uuid,
            is_deleted=False
        )
        if not end_warehouse:
            raise BadRequestError(f"End Warehouse not found with uuid: {operator_schema.end_warehouse_uuid}")

        start_point = to_shape(start_warehouse.coordinates)
        end_point = to_shape(end_warehouse.coordinates)





        ordered_customers, waypoints, route_coords = DistributionAlgorithm(uow=uow).run(
            polygon=to_shape(service_area.polygon),
            start_point=start_point,
            end_point=end_point,
            max_stops=parameter.get("max_stops"),  # You can set these parameters as needed
            min_stops=parameter.get("min_stops"),
            customer_categories=None,
            materials_filter=None
        )

        operator_schema.customer_uuids = [customer.uuid for customer in ordered_customers]
        operator_schema.waypoints = waypoints
        operator_schema.route_coordinates = route_coords

        task_exe.result = operator_schema.model_dump(mode="json")
        task_exe.status = WorkflowStatus.COMPLETED.value
        task_exe.end_time = datetime.now()
        task_exe.completed_by_uuid = payload.completed_by_uuid

        # Save the task execution with the result
        uow.task_execution_repository.save(task_exe, commit=False)

    def validate(self):
        raise NotImplementedError("The validate method must be implemented by subclasses.")

    @property
    def name(self) -> str:
        # name of class
        return self.__class__.__name__



