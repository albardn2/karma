from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.inventory_event import (
    InventoryEventCreate,
    InventoryEventRead,
    InventoryEventUpdate,
    InventoryEventListParams,
    InventoryEventPage,
)
from models.common import InventoryEvent as InventoryEventModel
from app.domains.inventory_event.domain import InventoryEventDomain
from app.entrypoint.routes.inventory_event import inventory_event_blueprint
from app.dto.inventory_event import InventoryEventType
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required



@inventory_event_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def create_inventory_event():
    """Create a new inventory event."""
    current_user_uuid = get_jwt_identity()
    payload = InventoryEventCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        ev_read = InventoryEventDomain.create_inventory_event(uow=uow, payload=payload)
        result = ev_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@inventory_event_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def get_inventory_event(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        ev = uow.inventory_event_repository.find_one(uuid=uuid, is_deleted=False)
        if not ev:
            raise NotFoundError('InventoryEvent not found')
        result = InventoryEventRead.from_orm(ev).model_dump(mode='json')
    return jsonify(result), 200

@inventory_event_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def update_inventory_event(uuid: str):
    payload = InventoryEventUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        ev = uow.inventory_event_repository.find_one(uuid=uuid,is_deleted=False)
        if not ev:
            raise NotFoundError('InventoryEvent not found')
        for field, val in updates.items():
            setattr(ev, field, val)
        uow.inventory_event_repository.save(model=ev, commit=True)
        result = InventoryEventRead.from_orm(ev).model_dump(mode='json')
    return jsonify(result), 200


@inventory_event_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_inventory_event(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        ev_read = InventoryEventDomain.delete_inventory_event(uow=uow, uuid=uuid)
        result = ev_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

#
@inventory_event_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def list_inventory_events():
    params = InventoryEventListParams(**request.args)
    filters: list = [InventoryEventModel.is_deleted == False]
    if params.uuid:
        filters.append(InventoryEventModel.uuid == params.uuid)
    if params.inventory_uuid:
        filters.append(InventoryEventModel.inventory_uuid == params.inventory_uuid)
    if params.event_type:
        filters.append(InventoryEventModel.event_type == params.event_type.value)
    if params.start_date:
        filters.append(InventoryEventModel.created_at >= params.start_date)
    if params.end_date:
        filters.append(InventoryEventModel.created_at <= params.end_date)
    if params.purchase_order_item_uuid:
        filters.append(InventoryEventModel.purchase_order_item_uuid == params.purchase_order_item_uuid)
    if params.customer_order_item_uuid:
        filters.append(InventoryEventModel.customer_order_item_uuid == params.customer_order_item_uuid)
    if params.debit_note_item_uuid:
        filters.append(InventoryEventModel.debit_note_item_uuid == params.debit_note_item_uuid)
    if params.credit_note_item_uuid:
        filters.append(InventoryEventModel.credit_note_item_uuid == params.credit_note_item_uuid)
    if params.process_uuid:
        filters.append(InventoryEventModel.process_uuid == params.process_uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page = uow.inventory_event_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [InventoryEventRead.from_orm(e).model_dump(mode='json') for e in page.items]
        result = InventoryEventPage(
            events=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode='json')
    return jsonify(result), 200


# InventoryEventType route
@inventory_event_blueprint.route('/event_types', methods=['GET'])
def list_inventory_event_types():
    """
    List all inventory event types.
    """
    event_types = [event_type.value for event_type in InventoryEventType]
    return jsonify(event_types), 200

