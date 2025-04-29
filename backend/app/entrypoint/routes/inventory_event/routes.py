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


@inventory_event_blueprint.route('/', methods=['POST'])
def create_inventory_event():
    print("Creating inventory event")
    print(request.json)
    payload = InventoryEventCreate(**request.json)
    print(payload)
    with SqlAlchemyUnitOfWork() as uow:
        ev_read = InventoryEventDomain.create_inventory_event(uow=uow, payload=payload)
        result = ev_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201


@inventory_event_blueprint.route('/<string:uuid>', methods=['GET'])
def get_inventory_event(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        ev = uow.inventory_event_repository.find_one(uuid=uuid, is_deleted=False)
        if not ev:
            raise NotFoundError('InventoryEvent not found')
        result = InventoryEventRead.from_orm(ev).model_dump(mode='json')
    return jsonify(result), 200

#
@inventory_event_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_inventory_event(uuid: str):
    payload = InventoryEventUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        ev = uow.inventory_event_repository.find_one(uuid=uuid)
        if not ev:
            raise NotFoundError('InventoryEvent not found')
        for field, val in updates.items():
            setattr(ev, field, val)
        uow.inventory_event_repository.save(model=ev, commit=True)
        result = InventoryEventRead.from_orm(ev).model_dump(mode='json')
    return jsonify(result), 200


@inventory_event_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_inventory_event(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        ev_read = InventoryEventDomain.delete_inventory_event(uow=uow, uuid=uuid)
        result = ev_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

#
@inventory_event_blueprint.route('/', methods=['GET'])
def list_inventory_events():
    params = InventoryEventListParams(**request.args)
    filters: list = [InventoryEventModel.is_deleted == False]
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