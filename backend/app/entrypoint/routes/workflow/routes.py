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
from app.entrypoint.routes.workflow import workflow_blueprint
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.domains.workflow.domain import WorkflowDomain
from app.dto.workflow import WorkflowTags


@workflow_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value)
def create_workflow():
    current_user_uuid = get_jwt_identity()
    payload = WorkflowCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = WorkflowDomain.create_workflow(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201

@workflow_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def get_workflow(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        workflow = uow.workflow_repository.find_one(uuid=uuid, is_deleted=False)
        if not workflow:
            raise NotFoundError(f"Workflow not found with uuid: {uuid}")

        dto = WorkflowRead.from_orm(workflow).model_dump(mode="json")
    return jsonify(dto), 200

# Route to update a Workflow
@workflow_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
)
def update_workflow(uuid: str):
    payload = WorkflowUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:

        dto = WorkflowDomain.update_workflow(uow=uow, uuid=uuid, payload=payload)
        uow.commit()

    return jsonify(dto.model_dump(mode="json")), 200

# Route to delete a Workflow
@workflow_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def delete_workflow(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = WorkflowDomain.delete_workflow(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200

# Route to list workflows with pagination and search
@workflow_blueprint.route("/", methods=["GET"])
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
def list_workflows():
    data=request.args.to_dict()
    if "tags" in data and not isinstance(data["tags"], list):
        data["tags"] = data["tags"].split(",")
    params = WorkflowListParams(**data)
    filters = [WorkflowModel.is_deleted == False]
    if params.uuid:
        filters.append(WorkflowModel.uuid == params.uuid)
    if params.name:
        filters.append(WorkflowModel.name.ilike(f"%{params.name}%"))
    if params.tags:
        if not isinstance(params.tags, list):
            raise BadRequestError("Tags must be a list")
        tag_vals = [tag.value for tag in params.tags]
        filters.append(WorkflowModel.tags.overlap(tag_vals))
    with SqlAlchemyUnitOfWork() as uow:
        page = uow.workflow_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            WorkflowRead.from_orm(workflow).model_dump(mode="json")
            for workflow in page.items
        ]
        result = WorkflowPage(
            workflows=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")

    return jsonify(result), 200

# Route to list workflow types (if applicable)
@workflow_blueprint.route("/tags", methods=["GET"])
def list_workflow_tags():
    """
    List all workflow types (this is an example of how you might return an enum or list).
    """

    values = [cat.value for cat in WorkflowTags]
    return jsonify(values), 200
