

from datetime import datetime
from typing import Optional
from app.dto.task_execution import OperatorType
from app.domains.task_execution.workflow_operators.operator_interface import OperatorInterface
from app.dto.task_execution import TaskExecutionComplete
from pydantic import BaseModel, ConfigDict, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.workflow_execution import (
    WorkflowStatus
)
from geoalchemy2.shape import to_shape, from_shape

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.service_area.geometry import parts as _parts, service_area_coverage
from app.domains.trip.distribution_algo import DistributionAlgorithm
from models.common import ServiceArea as ServiceAreaModel
from shapely import MultiPolygon


class TripRouteOperatorSchema(BaseModel):
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
        operator_schema = TripRouteOperatorSchema()

        task_exe = uow.task_execution_repository.find_one(uuid=payload.uuid)
        if not task_exe:
            raise BadRequestError(f"TaskExecution not found with uuid: {payload.uuid}")
        self.task_exe = task_exe
        self.all_tasks_executions = task_exe.workflow_execution.task_executions

        from app.domains.task_execution.workflow_operators.trip_setup import (
            LEGACY_CLUSTER,
            MANUAL,
            load_strategy_config,
            resolve_strategy,
        )

        strategy = resolve_strategy(self.get_start_trip_result())

        # manual mode: the driver adds stops ad hoc, no routing to compute
        if strategy == MANUAL:
            operator_schema.customer_uuids = []
            operator_schema.waypoints = []
            operator_schema.route_coordinates = []
            task_exe.result = operator_schema.model_dump(mode="json")
            task_exe.status = WorkflowStatus.COMPLETED.value
            task_exe.end_time = datetime.now()
            task_exe.completed_by_uuid = payload.completed_by_uuid
            uow.task_execution_repository.save(task_exe, commit=False)
            return

        # saved priority strategy (anything that isn't a built-in)
        if strategy != LEGACY_CLUSTER:
            from app.domains.trip.priority_router import PriorityRouter

            # both resolved through the helpers the pool preview also calls,
            # so the preview cannot be computed over a different strategy or
            # a different shape than the run it is previewing
            config = load_strategy_config(uow, strategy)
            polygon = service_area_coverage(uow, self.get_service_areas()).polygon

            ordered_customers, waypoints = PriorityRouter(uow).run(
                config=config,
                desired_stops=self.get_desired_stops(),
                polygon=polygon,
            )
            operator_schema.customer_uuids = [c.uuid for c in ordered_customers]
            operator_schema.waypoints = waypoints
            operator_schema.route_coordinates = []
            task_exe.result = operator_schema.model_dump(mode="json")
            task_exe.status = WorkflowStatus.COMPLETED.value
            task_exe.end_time = datetime.now()
            task_exe.completed_by_uuid = payload.completed_by_uuid
            uow.task_execution_repository.save(task_exe, commit=False)
            return

        service_area_names = self.get_service_areas()
        # name is in service_area names

        filters = []
        # is in service area
        filters.append(ServiceAreaModel.name.in_(service_area_names))
        service_areas = uow.service_area_repository._find_all_by_filters(filters=filters)

        polys = [p for sa in service_areas for p in _parts(to_shape(sa.geometry))]
        mp = MultiPolygon(polys)                    # MultiPolygon of all parts

        start_warehouse_name = self.get_start_warehouse_name()
        start_warehouse = uow.warehouse_repository.find_one(name=start_warehouse_name)
        if not start_warehouse:
            raise BadRequestError(f"Start Warehouse not found with name: {start_warehouse_name}")
        end_warehouse_name =  self.get_end_warehouse_name()
        end_warehouse = uow.warehouse_repository.find_one(name=end_warehouse_name)
        if not end_warehouse:
            raise BadRequestError(f"End Warehouse not found with name: {end_warehouse_name}")

        start_point = to_shape(start_warehouse.coordinates)
        end_point = to_shape(end_warehouse.coordinates)

        customer_categories = self.get_customer_categories()
        min_stops = self.min_stops()
        max_stops = self.get_max_stops()
        print("MAX STOPS =", max_stops)
        print("MIN STOPS = ", min_stops)

        last_visit_threshold_days = self.last_visit_threshold_days()


        ordered_customers, waypoints, route_coords = DistributionAlgorithm(uow=uow).run(
            polygons=mp,
            start_point=start_point,
            end_point=end_point,
            max_stops=max_stops,  # You can set these parameters as needed
            min_stops=min_stops,
            customer_categories=customer_categories,
            last_visit_threshold_days=last_visit_threshold_days
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


    def get_start_trip_result(self) -> Optional[dict]:
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result
        return None

    def get_desired_stops(self) -> Optional[int]:
        result = self.get_start_trip_result() or {}
        return result.get("desired_stops")

    def get_service_areas(self) -> str:
        """
        This method is a placeholder for retrieving the service area names.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("service_areas")

    def get_start_warehouse_name(self) -> str:
        """
        This method is a placeholder for retrieving the service area UUID.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("start_warehouse_name")

    def get_end_warehouse_name(self) -> str:
        """
        This method is a placeholder for retrieving the service area UUID.
        It should be implemented to return the actual service area UUID.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("end_warehouse_name")

    def get_customer_categories(self) -> list[str]:
        """
        This method is a placeholder for retrieving the customer categories.
        It should be implemented to return the actual customer categories.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("customer_categories")

    def get_max_stops(self) -> int:
        """
        This method is a placeholder for retrieving the customer categories.
        It should be implemented to return the actual customer categories.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("max_stops")

    def min_stops(self) -> int:
        """
        This method is a placeholder for retrieving the customer categories.
        It should be implemented to return the actual customer categories.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("min_stops")

    def last_visit_threshold_days(self) -> int:
        """
        This method is a placeholder for retrieving the customer categories.
        It should be implemented to return the actual customer categories.
        """
        for task_exe in self.all_tasks_executions:
            if task_exe.operator == OperatorType.START_TRIP_OPERATOR.value:
                return task_exe.result.get("last_visit_threshold_days")