# app/entrypoint/routes/task.py
from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from app.dto.task import (
    TaskCreate,
    TaskRead,
    TaskUpdate,
    TaskListParams,
    TaskPage
)
from models.common import Task as TaskModel
from app.entrypoint.routes.task import task_blueprint
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.domains.task.domain import TaskDomain
from app.domains.task_execution.workflow_operators.create_trip_operator import (
    current_outcome_options,
)


def _serve_live_outcome_options(task_dto: dict) -> dict:
    """Replace a trip-stop task's baked outcome options with the CURRENT enum.

    The list is snapshotted into task_inputs when the trip is created, so a trip
    already in flight keeps whatever options existed then. Both clients render
    these options, so a stale snapshot makes the web and app diverge from the
    live outcome list whenever the enum changes. Overriding on read keeps them
    in lockstep with no per-trip migration and no future drift. Mutates and
    returns the same dict for convenient chaining.
    """
    if task_dto.get("operator") != "trip_stop_operator":
        return task_dto
    fields = ((task_dto.get("task_inputs") or {}).get("fields")) or []
    for f in fields:
        if isinstance(f, dict) and f.get("type") == "select" and f.get("label") == "outcome":
            f["options"] = current_outcome_options()
    return task_dto


# Route to create a new Task
@task_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(PermissionScope.SUPER_ADMIN.value)
def create_task():
    current_user_uuid = get_jwt_identity()
    payload = TaskCreate(**request.json)

    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = TaskDomain.create_task(uow=uow, payload=payload)
        uow.commit()

    return jsonify(dto.model_dump(mode="json")), 201

@task_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    # the mobile trip screen reads each stop's task; assignees can be
    # drivers or sales (same audience as the workflow-execution routes)
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def get_task(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        task = uow.task_repository.find_one(uuid=uuid, is_deleted=False)
        if not task:
            raise NotFoundError(f"Task not found with uuid: {uuid}")
        dto = TaskRead.from_orm_with_enrichment(task,uow).model_dump(mode="json")
        dto = _serve_live_outcome_options(dto)
    return jsonify(dto), 200

# Route to update a Task
@task_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(PermissionScope.SUPER_ADMIN.value)
def update_task(uuid: str):
    payload = TaskUpdate(**request.json)

    with SqlAlchemyUnitOfWork() as uow:
        dto = TaskDomain.update_task(uow=uow, uuid=uuid, payload=payload)
        uow.commit()

    return jsonify(dto.model_dump(mode="json")), 200

# Route to delete a Task
@task_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(PermissionScope.SUPER_ADMIN.value)
def delete_task(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = TaskDomain.delete_task(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200

# Route to list tasks with pagination and search
@task_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value
)
def list_tasks():
    params = TaskListParams(**request.args)
    filters = [TaskModel.is_deleted == False]
    if params.uuid:
        filters.append(TaskModel.uuid == params.uuid)
    if params.name:
        filters.append(TaskModel.name.ilike(f"%{params.name}%"))
    if params.workflow_uuid:
        filters.append(TaskModel.workflow_uuid == params.workflow_uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page = uow.task_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            _serve_live_outcome_options(
                TaskRead.from_orm_with_enrichment(task,uow).model_dump(mode="json")
            )
            for task in page.items
        ]
        result = TaskPage(
            tasks=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")

    return jsonify(result), 200
