# app/entrypoint/routes/workflow.py
from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from app.dto.workflow import (
    WorkflowCreate,
    WorkflowRead,
    WorkflowUpdate,
    WorkflowListParams,
    WorkflowPage
)
from models.common import Workflow as WorkflowModel
from app.entrypoint.routes.workflow_execution import workflow_execution_blueprint
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.domains.workflow.domain import WorkflowDomain
from app.dto.workflow import WorkflowTags
from app.domains.workflow_execution.domain import WorkflowExecutionDomain
from app.dto.workflow_execution import (
    WorkflowExecutionCreate,
    WorkflowExecutionRead,
    WorkflowStatus,
    WorkflowExecutionListParams,
    WorkflowExecutionPage
)

from models.common import WorkflowExecution as WorkflowExecutionModel


@workflow_execution_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value
)
def create_workflow_execution():
    current_user_uuid = get_jwt_identity()
    data = request.get_json()
    payload = WorkflowExecutionCreate(**data)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = WorkflowExecutionDomain.create_workflow_execution(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201

@workflow_execution_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def get_workflow_execution(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        workflow_exe = uow.workflow_execution_repository.find_one(uuid=uuid)
        if not workflow_exe:
            raise NotFoundError(f"workflow_exe not found with uuid: {uuid}")

        dto = WorkflowExecutionRead.from_orm(workflow_exe).model_dump(mode="json")
    return jsonify(dto), 200


@workflow_execution_blueprint.route("/<string:uuid>/manual-stop", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def add_manual_stop(uuid: str):
    """Add an ad-hoc trip stop mid-trip: picks an existing customer or creates
    a new one on the spot, then creates the stop + its trip_stop task."""
    from datetime import datetime
    from app.dto.trip_stop import ManualStopCreate
    from app.dto.trip import TripStatus
    from app.dto.task_execution import OperatorType
    from app.dto.customer import CustomerCreate, CustomerRead
    from models.common import Customer as CustomerModel
    from app.utils.geom_utils import lat_lon_to_wkt
    from app.domains.task_execution.workflow_operators.create_trip_operator import create_trip_stop_with_task

    current_uuid = get_jwt_identity()
    payload = ManualStopCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        workflow_exe = uow.workflow_execution_repository.find_one(uuid=uuid)
        if not workflow_exe:
            raise NotFoundError(f"workflow_exe not found with uuid: {uuid}")
        trips = workflow_exe.trips
        if not trips:
            raise BadRequestError("This workflow execution has no trip yet")
        trip = trips[0]
        if trip.status != TripStatus.IN_PROGRESS.value:
            raise BadRequestError(f"Trip is not in progress (status: {trip.status})")

        # resolve or create the customer
        if payload.customer_uuid:
            customer = uow.customer_repository.find_one(uuid=payload.customer_uuid, is_deleted=False)
            if not customer:
                raise NotFoundError("Customer not found")
        else:
            customer_create = CustomerCreate(**payload.customer)
            customer_create.created_by_uuid = current_uuid
            if customer_create.email_address and uow.customer_repository.find_one(email_address=customer_create.email_address):
                raise BadRequestError(f"Customer with email {customer_create.email_address} already exists")
            customer = CustomerModel(**customer_create.model_dump())
            uow.customer_repository.save(model=customer, commit=False)

        # the stop needs coordinates; backfill from the request (device location)
        if customer.coordinates is None:
            if not payload.coordinates:
                raise BadRequestError("Customer has no coordinates; provide `coordinates` (lat,lon)")
            customer.coordinates = lat_lon_to_wkt(coords=payload.coordinates)
            uow.customer_repository.save(model=customer, commit=False)

        # flush + refresh so coordinates round-trips to a geometry element
        # (downstream code calls to_shape() on it)
        uow.session.flush()
        uow.session.refresh(customer)

        existing_indexes = [s.index for s in trip.stops if s.index is not None]
        next_index = (max(existing_indexes) + 1) if existing_indexes else 0

        trip_op_exe = next(
            (te for te in workflow_exe.task_executions if te.operator == OperatorType.TRIP_OPERATOR.value),
            None,
        )

        # splice the new stop into the execution chain: it follows the latest
        # finished chain task, and whatever previously followed that task is
        # rewired to depend on the new stop — so the flow continues through it.
        chain_ops = (OperatorType.TRIP_OPERATOR.value, OperatorType.TRIP_STOP_OPERATOR.value)
        completed_chain = [
            te for te in workflow_exe.task_executions
            if te.operator in chain_ops and te.status == WorkflowStatus.COMPLETED.value
        ]
        anchor = (
            max(completed_chain, key=lambda te: te.end_time or te.created_at)
            if completed_chain else trip_op_exe
        )
        successors = [
            te for te in workflow_exe.task_executions
            if anchor is not None
            and te.uuid != anchor.uuid
            and te.depends_on and anchor.name in te.depends_on
            and te.status in (WorkflowStatus.NOT_STARTED.value, WorkflowStatus.IN_PROGRESS.value)
        ]

        task_create, task_execution = create_trip_stop_with_task(
            uow=uow,
            workflow_execution=workflow_exe,
            customer=customer,
            created_by_uuid=current_uuid,
            index=next_index,
            depends_on=[anchor.name] if anchor is not None else [],
            parent_task_execution_uuid=trip_op_exe.uuid if trip_op_exe else None,
        )

        # the new stop is current when its anchor is already done
        new_exe_model = uow.task_execution_repository.find_one(uuid=task_execution.uuid)
        if anchor is not None and anchor.status == WorkflowStatus.COMPLETED.value:
            new_exe_model.status = WorkflowStatus.IN_PROGRESS.value
            new_exe_model.start_time = datetime.now()
            uow.task_execution_repository.save(model=new_exe_model, commit=False)

        # re-point the old successors (next stop / finish_trip) at the new stop
        for succ in successors:
            succ.depends_on = [task_create.name]
            if succ.status == WorkflowStatus.IN_PROGRESS.value:
                succ.status = WorkflowStatus.NOT_STARTED.value
                succ.start_time = None
            uow.task_execution_repository.save(model=succ, commit=False)

        uow.commit()
        result = {
            "task_execution_uuid": task_execution.uuid,
            "customer": CustomerRead.from_orm(customer).model_dump(mode="json"),
        }
    return jsonify(result), 201

# # Route to update a Workflow
# @workflow_execution_blueprint.route("/<string:uuid>", methods=["PUT"])
# @jwt_required()
# @scopes_required(
#     PermissionScope.ADMIN.value,
#     PermissionScope.SUPER_ADMIN.value,
#     PermissionScope.OPERATION_MANAGER.value,
# )
# def update_workflow(uuid: str):
#     payload = WorkflowUpdate(**request.json)
#     with SqlAlchemyUnitOfWork() as uow:
#         dto = WorkflowDomain.update_workflow(uow=uow, uuid=uuid, payload=payload)
#         uow.commit()
#
#     return jsonify(dto.model_dump(mode="json")), 200
#
# # Route to delete a Workflow
# @workflow_execution_blueprint.route("/<string:uuid>", methods=["DELETE"])
# @jwt_required()
# @scopes_required(
#     PermissionScope.ADMIN.value,
#     PermissionScope.SUPER_ADMIN.value,
# )
# def delete_workflow(uuid: str):
#     with SqlAlchemyUnitOfWork() as uow:
#         dto = WorkflowDomain.delete_workflow(uow=uow, uuid=uuid)
#         uow.commit()
#     return jsonify(dto.model_dump(mode="json")), 200

# # Route to list workflows with pagination and search
@workflow_execution_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def list_workflow_executions():
    data=request.args.to_dict()
    if "tags" in data and not isinstance(data["tags"], list):
        data["tags"] = data["tags"].split(",")
    params = WorkflowExecutionListParams(**data)
    filters = []
    if params.uuid:
        filters.append(WorkflowExecutionModel.uuid == params.uuid)
    if params.workflow_uuid:
        filters.append(WorkflowExecutionModel.workflow_uuid == params.workflow_uuid)
    if params.status:
        filters.append(WorkflowExecutionModel.status == params.status.value)
    if params.name:
        filters.append(WorkflowExecutionModel.name.ilike(f"%{params.name}%"))
    if params.tags:
        if not isinstance(params.tags, list):
            raise BadRequestError("Tags must be a list")
        tag_vals = [tag.value for tag in params.tags]
        filters.append(WorkflowExecutionModel.tags.overlap(tag_vals))
    if params.start_time:
        filters.append(WorkflowExecutionModel.start_time >= params.start_time)
    if params.end_time:
        filters.append(WorkflowExecutionModel.start_time <= params.end_time)
    from sqlalchemy import or_, select
    from models.common import TaskExecution as TaskExecutionModel
    from models.common import Task as TaskModel

    def owned_or_assigned_filter(user):
        """Executions created by `user` OR whose start_trip setup assigns them
        (result.assigned_user_uuid stores a username; also match uuid)."""
        values = [user.uuid, user.username]
        assigned_exists = (
            select(TaskExecutionModel.uuid)
            .join(TaskModel, TaskModel.uuid == TaskExecutionModel.task_uuid)
            .where(
                TaskExecutionModel.workflow_execution_uuid == WorkflowExecutionModel.uuid,
                TaskModel.operator == "start_trip_operator",
                TaskExecutionModel.result["assigned_user_uuid"].astext.in_(values),
            )
            .exists()
        )
        return or_(WorkflowExecutionModel.created_by_uuid == user.uuid, assigned_exists)

    with SqlAlchemyUnitOfWork() as uow:
        current_uuid = get_jwt_identity()
        current_user = uow.user_repository.find_one(uuid=current_uuid, is_deleted=False)
        is_admin = bool(current_user and current_user.is_admin)

        if not is_admin:
            # non-admins can ONLY ever see their own trips — enforced server-side
            # regardless of the `mine`/`assigned_user_uuid` params they send.
            if current_user:
                filters.append(owned_or_assigned_filter(current_user))
            else:
                filters.append(WorkflowExecutionModel.created_by_uuid == current_uuid)
        else:
            # admins see everything, but may narrow to a specific user (by the
            # assigned_user_uuid filter) or to just their own (mine=true).
            target = None
            if params.assigned_user_uuid:
                target = (
                    uow.user_repository.find_one(uuid=params.assigned_user_uuid, is_deleted=False)
                    or uow.user_repository.find_one(username=params.assigned_user_uuid, is_deleted=False)
                )
                if not target:
                    # requested a specific user that doesn't exist → return nothing
                    filters.append(WorkflowExecutionModel.uuid == "__no_such_user__")
            elif params.mine:
                target = current_user
            if target:
                filters.append(owned_or_assigned_filter(target))

        page = uow.workflow_execution_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            WorkflowExecutionRead.from_orm(workflow_exe).model_dump(mode="json")
            for workflow_exe in page.items
        ]
        result = WorkflowExecutionPage(
            workflow_executions=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")

    return jsonify(result), 200


@workflow_execution_blueprint.route("/cancel/<string:uuid>", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def cancel_workflow_execution(uuid: str):
    """
    Cancel a workflow execution by UUID.
    """
    with SqlAlchemyUnitOfWork() as uow:
        dto = WorkflowExecutionDomain.cancel_workflow_execution(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200

@workflow_execution_blueprint.route("/status", methods=["GET"])
def list_workflow_status():
    """
    List all workflow types (this is an example of how you might return an enum or list).
    """

    values = [cat.value for cat in WorkflowStatus]
    return jsonify(values), 200
