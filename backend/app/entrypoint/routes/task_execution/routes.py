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
from app.dto.task_execution import OperatorType






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

    # never list children of a soft-deleted execution
    from models.common import WorkflowExecution as WorkflowExecutionModel
    filters.append(
        TaskExecutionModel.workflow_execution.has(WorkflowExecutionModel.is_deleted.is_(False))
    )

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

@task_execution_blueprint.route("/strategy-pool-preview", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value)
def strategy_pool_preview():
    """How many customers the picked strategy's priorities match right now.

    The setup form's preview: the router's filtering stage with none of its
    selection stage, for the service areas ticked on the form.

    POST rather than GET because service-area names are a free-text list.
    Every query-param reader in this tree resolves a werkzeug MultiDict
    through __getitem__, which keeps only the FIRST value of a repeated key —
    a GET would answer 200 with a number computed from one area out of N.
    Comma-joining is out too: a service area name has no validator, so commas
    and spaces are legal in one.

    The scope tuple is copied verbatim from /complete above. scopes_required
    is NOT the runtime gate though — endpoint_allowed on (blueprint, method)
    is — which is why this route lives on task_execution rather than
    routing_strategy, a resource five of the roles that can complete this
    task hold no grant for at all.

    One asymmetry, stated rather than glossed: READ_SHAPED_POST_ENDPOINTS
    makes the chokepoint check this as a READ while /complete is checked as
    a CREATE. Every shipped role preset holds both actions on
    task_execution, so the two audiences are identical today — but the
    permission editors write the four CRUD boxes independently, so a
    hand-made create-without-read grant could submit this form and be
    refused the number printed on it. The client hides the block on 403
    rather than offering a Retry that cannot succeed.
    """
    from app.domains.trip.strategy_preview import preview_strategy_pool
    from app.dto.task_execution import StrategyPoolPreviewRequest

    # get_json(silent=True) rather than request.json: Flask 3 raises 415 when
    # the client omits Content-Type, and a preview must never be the thing
    # that breaks the form
    body = request.get_json(silent=True) or {}
    # a JSON array, string or number body is truthy and non-mapping, so **
    # would raise TypeError and answer 500 for a plainly bad request
    if not isinstance(body, dict):
        raise BadRequestError("Request body must be a JSON object")
    payload = StrategyPoolPreviewRequest(**body)
    with SqlAlchemyUnitOfWork() as uow:
        dto = preview_strategy_pool(uow, payload.strategy, payload.service_areas)
    return jsonify(dto.model_dump(mode="json")), 200


@task_execution_blueprint.route("/workflow-operators", methods=["GET"])
def list_task_operators():
    """
    List all workflow types (this is an example of how you might return an enum or list).
    """

    values = [o.value for o in OperatorType]
    return jsonify(values), 200


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
        if not task_exe or (task_exe.workflow_execution and task_exe.workflow_execution.is_deleted):
            raise NotFoundError(f"task_exe not found with uuid: {uuid}")

        dto = TaskExecutionRead.from_orm(task_exe).model_dump(mode="json")
    return jsonify(dto), 200

