from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from app.dto.auth import PermissionScope
from app.dto.vehicle_inventory import (
    VehicleInventoryCreate,
    VehicleInventoryUpdate,
    VehicleInventoryRead,
    VehicleInventoryListParams,
    VehicleInventoryPage,
)
from models.common import VehicleInventory as VehicleInventoryModel
from app.domains.vehicle_inventory.domain import VehicleInventoryDomain
from app.entrypoint.routes.vehicle_inventory import vehicle_inventory_blueprint

_ALL_SCOPES = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.SALES.value,
    PermissionScope.DRIVER.value,
)


@vehicle_inventory_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def create_vehicle_inventory():
    current_user_uuid = get_jwt_identity()
    payload = VehicleInventoryCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        read = VehicleInventoryDomain.create_vehicle_inventory(uow=uow, payload=payload)
        result = read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201


@vehicle_inventory_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def get_vehicle_inventory(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.vehicle_inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inv:
            raise NotFoundError('Vehicle inventory not found')
        result = VehicleInventoryRead.from_orm(inv).model_dump(mode='json')
    return jsonify(result), 200


@vehicle_inventory_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def update_vehicle_inventory(uuid: str):
    payload = VehicleInventoryUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.vehicle_inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inv:
            raise NotFoundError('Vehicle inventory not found')
        for field, val in updates.items():
            setattr(inv, field, val)
        uow.vehicle_inventory_repository.save(model=inv, commit=True)
        result = VehicleInventoryRead.from_orm(inv).model_dump(mode='json')
    return jsonify(result), 200


@vehicle_inventory_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def delete_vehicle_inventory(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        read = VehicleInventoryDomain.delete_vehicle_inventory(uow=uow, uuid=uuid)
        result = read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200


@vehicle_inventory_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def list_vehicle_inventories():
    params = VehicleInventoryListParams(**request.args)
    filters = [VehicleInventoryModel.is_deleted == False]
    if params.uuid:
        filters.append(VehicleInventoryModel.uuid == params.uuid)
    if params.vehicle_uuid:
        filters.append(VehicleInventoryModel.vehicle_uuid == params.vehicle_uuid)
    if params.material_uuid:
        filters.append(VehicleInventoryModel.material_uuid == params.material_uuid)
    if params.is_active is not None:
        filters.append(VehicleInventoryModel.is_active == params.is_active)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.vehicle_inventory_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )
        items = [VehicleInventoryRead.from_orm(i).model_dump(mode='json') for i in page_obj.items]
        result = VehicleInventoryPage(
            vehicle_inventories=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages,
        ).model_dump(mode='json')
    return jsonify(result), 200
