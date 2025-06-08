# app/entrypoint/routes/workflow.py
from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from app.entrypoint.routes.task_execution import task_execution_blueprint
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from models.common import TaskExecution as TaskExecutionModel
from app.dto.task_execution import TaskExecutionRead
from app.dto.task_execution import TaskExecutionListParams, TaskExecutionPage
from app.domains.task_execution.domain import TaskExecutionDomain
from app.dto.task_execution import TaskExecutionComplete


@task_execution_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def get_task_execution(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        task_exe = uow.task_execution_repository.find_one(uuid=uuid)
        if not task_exe:
            raise NotFoundError(f"task_exe not found with uuid: {uuid}")

        dto = TaskExecutionRead.from_orm(task_exe).model_dump(mode="json")
    return jsonify(dto), 200


@task_execution_blueprint.route("/", methods=["GET"])
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
def list_task_executions():
    data=request.args.to_dict()
    params = TaskExecutionListParams(**data)
    filters = []
    if params.uuid:
        filters.append(TaskExecutionModel.uuid == params.uuid)
    if params.task_uuid:
        filters.append(TaskExecutionModel.task_uuid == params.task_uuid)
    if params.name:
        filters.append(TaskExecutionModel.name.ilike(f"%{params.name}%"))
    if params.workflow_execution_uuid:
        filters.append(TaskExecutionModel.workflow_execution_uuid == params.workflow_execution_uuid)
    if params.parent_task_execution_uuid:
        filters.append(TaskExecutionModel.parent_task_execution_uuid == params.parent_task_execution_uuid)
    if params.status:
        filters.append(TaskExecutionModel.status == params.status)
    if params.start_time:
        filters.append(TaskExecutionModel.start_time >= params.start_time)
    if params.end_time:
        filters.append(TaskExecutionModel.end_time <= params.end_time)

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.task_execution_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            TaskExecutionRead.from_orm(task_exe).model_dump(mode="json")
            for task_exe in page.items
        ]
        result = TaskExecutionPage(
            task_executions=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")

    return jsonify(result), 200


@task_execution_blueprint.route("/complete", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def task_complete():
    current_user_uuid = get_jwt_identity()
    payload = TaskExecutionComplete(**request.json)
    payload.completed_by_uuid = current_user_uuid
    with SqlAlchemyUnitOfWork() as uow:
        dto = TaskExecutionDomain.complete_task_execution(uow=uow,payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200

