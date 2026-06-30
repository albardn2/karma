# app/entrypoint/routes/trip/routes.py
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.trip import (
    TripCreate,
    TripRead,
    TripUpdate,
    TripListParams,
    TripPage,
)
from models.common import Trip as TripModel
from app.domains.trip.domain import TripDomain

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.entrypoint.routes.trip import trip_blueprint


@trip_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def create_trip():
    current_user_uuid = get_jwt_identity()
    payload = TripCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = TripDomain.create_trip(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@trip_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def get_trip(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.trip_repository.find_one(uuid=uuid)
        if not m:
            raise NotFoundError("Trip not found")
        dto = TripRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200
#
#
@trip_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def update_trip(uuid: str):
    payload = TripUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = TripDomain.update_trip(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@trip_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def list_trips():
    params = TripListParams(**request.args)
    filters = []
    if params.uuid:
        filters.append(TripModel.uuid == params.uuid)
    if params.created_by_uuid:
        filters.append(TripModel.created_by_uuid == params.created_by_uuid)
    if params.vehicle_uuid:
        filters.append(TripModel.vehicle_uuid == params.vehicle_uuid)
    if params.service_area_uuid:
        filters.append(TripModel.service_area_uuid == params.service_area_uuid)
    if params.status:
        filters.append(TripModel.status.ilike(f"%{params.status}%"))
    if params.intersects_area:
        geom_expr = func.ST_GeomFromText(params.intersects_area, 4326)
        filters.append(func.ST_Intersects(TripModel.geometry, geom_expr))

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.trip_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )
        # Convert each geometry field to WKT via TripRead validator
        items = [TripRead.from_orm(m).model_dump(mode="json") for m in page.items]
        result = TripPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200
