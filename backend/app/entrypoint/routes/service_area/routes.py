# app/entrypoint/routes/service_area/routes.py
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.service_area import (
    ServiceAreaCreate,
    ServiceAreaRead,
    ServiceAreaUpdate,
    ServiceAreaListParams,
    ServiceAreaPage,
)
from models.common import ServiceArea as ServiceAreaModel
from app.domains.service_area.domain import ServiceAreaDomain

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.entrypoint.routes.service_area import service_area_blueprint


@service_area_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def create_service_area():
    current_user_uuid = get_jwt_identity()
    payload = ServiceAreaCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = ServiceAreaDomain.create_service_area(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@service_area_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def get_service_area(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.service_area_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("Service area not found")
        dto = ServiceAreaRead.from_orm(m)
        dto = dto.model_dump(mode="json")
    return jsonify(dto), 200


@service_area_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def update_service_area(uuid: str):
    payload = ServiceAreaUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = ServiceAreaDomain.update_service_area(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@service_area_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def delete_service_area(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = ServiceAreaDomain.delete_service_area(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@service_area_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def list_service_areas():
    params = ServiceAreaListParams(**request.args)
    filters = [ServiceAreaModel.is_deleted == False]

    if params.uuid:
        filters.append(ServiceAreaModel.uuid == params.uuid)
    if params.created_by_uuid:
        filters.append(ServiceAreaModel.created_by_uuid == params.created_by_uuid)
    if params.name:
        filters.append(ServiceAreaModel.name.ilike(f"%{params.name}%"))
    if params.intersects_polygon:
        geom_expr = func.ST_GeomFromText(params.intersects_polygon, 4326)
        filters.append(func.ST_Intersects(ServiceAreaModel.geometry, geom_expr))

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.service_area_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )
        items = [
            ServiceAreaRead.from_orm(m).model_dump(mode="json")
            for m in page.items
        ]
        result = ServiceAreaPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200
