from flask import request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.purchase_order import (
    PurchaseOrderCreate, PurchaseOrderRead,
    PurchaseOrderUpdate, PurchaseOrderListParams,
    PurchaseOrderPage
)
from models.common import PurchaseOrder as PurchaseOrderModel
from app.entrypoint.routes.purchase_order import purchase_order_blueprint
from app.dto.purchase_order import PurchaseOrderCreateWithItems
from app.domains.purchase_order.domain import PurchaseOrderDomain


@purchase_order_blueprint.route('/with-items', methods=['POST'])
def create_order_with_items():
    payload = PurchaseOrderCreateWithItems(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = PurchaseOrderDomain.create_purchase_order_with_items(uow=uow, payload=payload)
        result = dto.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@purchase_order_blueprint.route('/with-items/<string:uuid>', methods=['DELETE'])
def delete_order_with_items(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = PurchaseOrderDomain.delete_purchase_order_with_items(uow=uow, uuid=uuid)
        result = dto.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

# ----------------------------------------------------------


@purchase_order_blueprint.route('/', methods=['POST'])
def create_order():
    try:
        payload = PurchaseOrderCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json', exclude_unset=True)
        print(data)
        po = PurchaseOrderModel(**data)
        print(po.__dict__)
        uow.purchase_order_repository.save(model=po, commit=True)
        result = PurchaseOrderRead.from_orm(po).model_dump(mode='json')

    return jsonify(result), 201

@purchase_order_blueprint.route('/<string:uuid>', methods=['GET'])
def get_order(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        po = uow.purchase_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            return jsonify({'message': 'PurchaseOrder not found'}), 404
        result = PurchaseOrderRead.from_orm(po).model_dump(mode='json')
    return jsonify(result), 200

@purchase_order_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_order(uuid: str):
    payload = PurchaseOrderUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = PurchaseOrderDomain.update_purchase_order(
            uow=uow,
            uuid=uuid,
            payload=payload
        )
        result = dto.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@purchase_order_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_order(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        po = uow.purchase_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            return jsonify({'message': 'PurchaseOrder not found'}), 404
        po.is_deleted = True
        uow.purchase_order_repository.save(model=po, commit=True)
        result = PurchaseOrderRead.from_orm(po).model_dump(mode='json')
    return jsonify(result), 200

@purchase_order_blueprint.route('/', methods=['GET'])
def list_orders():
    params = PurchaseOrderListParams(**request.args)
    # build SQLAlchemy filters
    filters = [PurchaseOrderModel.is_deleted == False]
    if params.uuid:
        filters.append(PurchaseOrderModel.uuid == params.uuid)
    if params.is_overdue is not None:
        filters.append(PurchaseOrderModel.is_overdue == params.is_overdue)
    if params.is_fulfilled is not None:
        filters.append(PurchaseOrderModel.is_fulfilled == params.is_fulfilled)
    if params.vendor_uuid:
        filters.append(PurchaseOrderModel.vendor_uuid == params.vendor_uuid)
    if params.status:
        filters.append(PurchaseOrderModel.status == params.status)
    if params.is_paid is not None:
        filters.append(PurchaseOrderModel.is_paid == params.is_paid)
    if params.start_date:
        filters.append(PurchaseOrderModel.created_at >= params.start_date)
    if params.end_date:
        filters.append(PurchaseOrderModel.created_at <= params.end_date)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.purchase_order_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            PurchaseOrderRead.from_orm(po).model_dump(mode='json')
            for po in page_obj.items
        ]
        result = PurchaseOrderPage(
            purchase_orders=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
