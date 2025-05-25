from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.purchase_order_item import (
    PurchaseOrderItemCreate,
    PurchaseOrderItemRead,
    PurchaseOrderItemUpdate,
    PurchaseOrderItemListParams,
    PurchaseOrderItemPage,
)
from models.common import PurchaseOrderItem as PurchaseOrderItemModel
from app.entrypoint.routes.purchase_order_item import poi_blueprint
from app.domains.purchase_order_item.domain import PurchaseOrderItemDomain
from app.dto.purchase_order_item import PurchaseOrderItemBulkFulfill
from app.dto.purchase_order_item import PurchaseOrderItemBulkUnFulfill


@poi_blueprint.route('/fulfill-items', methods=['POST'])
def fulfill_order_items():
    payload = PurchaseOrderItemBulkFulfill(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read = PurchaseOrderItemDomain.fulfill_items(
            uow=uow,
            payload=payload)
        uow.commit()
    return jsonify([r.model_dump(mode='json') for r in bulk_read]), 200

@poi_blueprint.route('/unfulfill-items', methods=['POST'])
def unfulfill_order_items():
    payload = PurchaseOrderItemBulkUnFulfill(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read = PurchaseOrderItemDomain.unfulfill_items(
            uow=uow,
            payload=payload)
        uow.commit()
    return jsonify([r.model_dump(mode='json') for r in bulk_read]), 200

@poi_blueprint.route('/', methods=['POST'])
def create_item():
    try:
        payload = PurchaseOrderItemCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        item = PurchaseOrderItemModel(**data)
        uow.purchase_order_item_repository.save(model=item, commit=True)
        result = PurchaseOrderItemRead.from_orm(item).model_dump(mode='json')
    return jsonify(result), 201

@poi_blueprint.route('/<string:uuid>', methods=['GET'])
def get_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        item = uow.purchase_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not item:
            return jsonify({'message': 'PurchaseOrderItem not found'}), 404
        result = PurchaseOrderItemRead.from_orm(item).model_dump(mode='json')
    return jsonify(result), 200

@poi_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_item(uuid: str):
    try:
        payload = PurchaseOrderItemUpdate(**request.json)
        updates = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        item = uow.purchase_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not item:
            return jsonify({'message': 'PurchaseOrderItem not found'}), 404
        for field, val in updates.items(): setattr(item, field, val)
        uow.purchase_order_item_repository.save(model=item, commit=True)
        result = PurchaseOrderItemRead.from_orm(item).model_dump(mode='json')
    return jsonify(result), 200

@poi_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        item = uow.purchase_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not item:
            return jsonify({'message': 'PurchaseOrderItem not found'}), 404
        item.is_deleted = True
        uow.purchase_order_item_repository.save(model=item, commit=True)
        result = PurchaseOrderItemRead.from_orm(item).model_dump(mode='json')
    return jsonify(result), 200

@poi_blueprint.route('/', methods=['GET'])
def list_items():
    try:
        params = PurchaseOrderItemListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    filters = [PurchaseOrderItemModel.is_deleted == False]
    if params.uuid:
        filters.append(PurchaseOrderItemModel.uuid == params.uuid)
    if params.purchase_order_uuid:
        filters.append(PurchaseOrderItemModel.purchase_order_uuid == params.purchase_order_uuid)
    if params.material_uuid:
        filters.append(PurchaseOrderItemModel.material_uuid == params.material_uuid)
    if params.is_fulfilled is not None:
        filters.append(PurchaseOrderItemModel.is_fulfilled == params.is_fulfilled)
    if params.start_date:
        filters.append(PurchaseOrderItemModel.created_at >= params.start_date)
    if params.end_date:
        filters.append(PurchaseOrderItemModel.created_at <= params.end_date)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.purchase_order_item_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [PurchaseOrderItemRead.from_orm(i).model_dump(mode='json') for i in page_obj.items]
        result = PurchaseOrderItemPage(
            items=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
