# app/entrypoint/routes/vehicle/routes.py
from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.vehicle import (
    VehicleCreate,
    VehicleRead,
    VehicleUpdate,
    VehicleListParams,
    VehiclePage,
)
from models.common import Vehicle as VehicleModel
from app.domains.vehicle.domain import VehicleDomain

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.entrypoint.routes.vehicle import vehicle_blueprint


@vehicle_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def create_vehicle():
    current_user_uuid = get_jwt_identity()
    payload = VehicleCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = VehicleDomain.create_vehicle(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@vehicle_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
    PermissionScope.ACCOUNTANT.value,
)
def get_vehicle(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.vehicle_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("Vehicle not found")
        dto = VehicleRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200


@vehicle_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def update_vehicle(uuid: str):
    payload = VehicleUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = VehicleDomain.update_vehicle(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200
#

@vehicle_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def delete_vehicle(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = VehicleDomain.delete_vehicle(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@vehicle_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
    PermissionScope.ACCOUNTANT.value,
)
def list_vehicles():
    params = VehicleListParams(**request.args)
    filters = [VehicleModel.is_deleted == False]

    if params.uuid:
        filters.append(VehicleModel.uuid == params.uuid)
    if params.created_by_uuid:
        filters.append(VehicleModel.created_by_uuid == params.created_by_uuid)
    if params.plate_number:
        filters.append(VehicleModel.plate_number.ilike(f"%{params.plate_number}%"))
    if params.model:
        filters.append(VehicleModel.model.ilike(f"%{params.model}%"))
    if params.make:
        filters.append(VehicleModel.make.ilike(f"%{params.make}%"))
    if params.year:
        filters.append(VehicleModel.year == params.year)
    if params.color:
        filters.append(VehicleModel.color.ilike(f"%{params.color}%"))
    if params.status:
        filters.append(VehicleModel.status.ilike(f"%{params.status}%"))
    if params.vin:
        filters.append(VehicleModel.vin.ilike(f"%{params.vin}%"))
    with SqlAlchemyUnitOfWork() as uow:
        page = uow.vehicle_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )
        items = [
            VehicleRead.from_orm(m).model_dump(mode="json") for m in page.items
        ]
        result = VehiclePage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200
