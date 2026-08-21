# app/entrypoint/routes/routing_strategy/routes.py
from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.routing_strategy.domain import RoutingStrategyDomain
from app.dto.auth import PermissionScope
from app.dto.routing_strategy import (
    RoutingStrategyCreate,
    RoutingStrategyListParams,
    RoutingStrategyPage,
    RoutingStrategyRead,
    RoutingStrategyUpdate,
)
from app.entrypoint.routes.common.auth import add_logged_user_to_payload, scopes_required
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.routing_strategy import routing_strategy_blueprint
from models.common import RoutingStrategy as RoutingStrategyModel

# Writes: the people who plan distribution. Reads add operators (the setup
# form's dropdown is enriched server-side under the task blueprint, but the
# builder UI lists existing strategies before creating one). These scopes
# must stay in lockstep with role_presets.json's routing_strategy grants —
# the fine-grained ACL is the enforced gate for non-admins, so a scope listed
# here without a preset grant is inert.
_WRITE_SCOPES = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
)
_READ_SCOPES = _WRITE_SCOPES + (
    PermissionScope.OPERATOR.value,
)


@routing_strategy_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(*_WRITE_SCOPES)
def create_routing_strategy():
    current_user_uuid = get_jwt_identity()
    payload = RoutingStrategyCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = RoutingStrategyDomain.create_routing_strategy(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@routing_strategy_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(*_READ_SCOPES)
def get_routing_strategy(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        strategy = uow.routing_strategy_repository.find_one(uuid=uuid, is_deleted=False)
        if not strategy:
            raise NotFoundError(f"RoutingStrategy not found with uuid: {uuid}")
        dto = RoutingStrategyRead.from_orm(strategy)
    return jsonify(dto.model_dump(mode="json")), 200


@routing_strategy_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(*_WRITE_SCOPES)
def update_routing_strategy(uuid: str):
    payload = RoutingStrategyUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = RoutingStrategyDomain.update_routing_strategy(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@routing_strategy_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(*_WRITE_SCOPES)
def delete_routing_strategy(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = RoutingStrategyDomain.delete_routing_strategy(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@routing_strategy_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(*_READ_SCOPES)
def list_routing_strategies():
    params = RoutingStrategyListParams(**request.args)
    with SqlAlchemyUnitOfWork() as uow:
        filters = [RoutingStrategyModel.is_deleted == False]  # noqa: E712
        if params.uuid:
            filters.append(RoutingStrategyModel.uuid == params.uuid)
        if params.name:
            filters.append(RoutingStrategyModel.name.ilike(f"%{params.name}%"))
        page = uow.routing_strategy_repository.find_all_by_filters_paginated(
            filters=filters, page=params.page, per_page=params.per_page,
        )
        result = RoutingStrategyPage(
            routing_strategies=[RoutingStrategyRead.from_orm(s) for s in page.items],
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200
