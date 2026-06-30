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
    payload = WorkflowExecutionCreate(**request.json)
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
    with SqlAlchemyUnitOfWork() as uow:
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
