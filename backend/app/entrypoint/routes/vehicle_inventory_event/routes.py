from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from app.dto.auth import PermissionScope
from app.dto.vehicle_inventory_event import (
    VehicleInventoryEventCreate,
    VehicleInventoryEventRead,
    VehicleInventoryEventListParams,
    VehicleInventoryEventPage,
)
from models.common import VehicleInventoryEvent as VehicleInventoryEventModel
from app.domains.vehicle_inventory_event.domain import VehicleInventoryEventDomain
from app.entrypoint.routes.vehicle_inventory_event import vehicle_inventory_event_blueprint

_ALL_SCOPES = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.ACCOUNTANT.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.SALES.value,
    PermissionScope.DRIVER.value,
)


@vehicle_inventory_event_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def create_vehicle_inventory_event():
    current_user_uuid = get_jwt_identity()
    payload = VehicleInventoryEventCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        read = VehicleInventoryEventDomain.create_event(uow=uow, payload=payload)
        result = read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201


@vehicle_inventory_event_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def get_vehicle_inventory_event(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        event = uow.vehicle_inventory_event_repository.find_one(uuid=uuid, is_deleted=False)
        if not event:
            raise NotFoundError('Vehicle inventory event not found')
        result = VehicleInventoryEventRead.from_orm(event).model_dump(mode='json')
    return jsonify(result), 200


@vehicle_inventory_event_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def delete_vehicle_inventory_event(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        read = VehicleInventoryEventDomain.delete_event(uow=uow, uuid=uuid)
        result = read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200


@vehicle_inventory_event_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(*_ALL_SCOPES)
def list_vehicle_inventory_events():
    params = VehicleInventoryEventListParams(**request.args)
    filters = [VehicleInventoryEventModel.is_deleted == False]
    if params.uuid:
        filters.append(VehicleInventoryEventModel.uuid == params.uuid)
    if params.vehicle_inventory_uuid:
        filters.append(VehicleInventoryEventModel.vehicle_inventory_uuid == params.vehicle_inventory_uuid)
    if params.event_type:
        filters.append(VehicleInventoryEventModel.event_type == params.event_type.value)
    if params.start_date:
        filters.append(VehicleInventoryEventModel.created_at >= params.start_date)
    if params.end_date:
        filters.append(VehicleInventoryEventModel.created_at <= params.end_date)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.vehicle_inventory_event_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )
        items = [VehicleInventoryEventRead.from_orm(e).model_dump(mode='json') for e in page_obj.items]
        result = VehicleInventoryEventPage(
            events=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages,
        ).model_dump(mode='json')
    return jsonify(result), 200
