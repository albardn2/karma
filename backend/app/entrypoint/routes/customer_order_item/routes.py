from flask import Blueprint, request, jsonify
from datetime import datetime
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.customer_order_item import (
    CustomerOrderItemBulkCreate,
    CustomerOrderItemBulkRead,
    CustomerOrderItemRead,
    CustomerOrderItemListParams,
    CustomerOrderItemPage,
)
from models.common import CustomerOrderItem as CustomerOrderItemModel
from app.entrypoint.routes.customer_order_item import customer_order_item_blueprint
from app.domains.customer_order_item.domain import CustomerOrderItemDomain

from app.dto.customer_order_item import CustomerOrderItemBulkFulfill
from app.dto.customer_order_item import CustomerOrderItemBulkDelete

from app.dto.customer_order_item import CustomerOrderItemBulkUnFulfill

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@customer_order_item_blueprint.route('/bulk-create', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER,
                 PermissionScope.ACCOUNTANT
                 )
def create_order_items():
    # Expect a JSON object with an 'items' list
    current_user_uuid = get_jwt_identity()
    payload = CustomerOrderItemBulkCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        # Add the logged user to the payload
        for item in payload.items:
            add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=item)
        bulk_read = CustomerOrderItemDomain.create_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    # Return bulk read DTO
    return jsonify(bulk_read.model_dump(mode='json')), 201

@customer_order_item_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER,
                 PermissionScope.ACCOUNTANT
                 )
def get_order_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.customer_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError('CustomerOrderItem not found')
        dto = CustomerOrderItemRead.from_orm(m).model_dump(mode='json')
    return jsonify(dto), 200

@customer_order_item_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER,
                 PermissionScope.ACCOUNTANT
                 )
def list_order_items():
    params = CustomerOrderItemListParams(**request.args)
    filters = [CustomerOrderItemModel.is_deleted == False]
    if params.customer_order_uuid:
        filters.append(CustomerOrderItemModel.customer_order_uuid == params.customer_order_uuid)
    if params.uuid:
        filters.append(CustomerOrderItemModel.uuid == params.uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.customer_order_item_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [CustomerOrderItemRead.from_orm(m) for m in page_obj.items]
        # Use bulk read DTO
        result = CustomerOrderItemPage(
            items=[i.model_dump(mode='json') for i in items],
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
#
@customer_order_item_blueprint.route('/fulfill-items', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.OPERATION_MANAGER.value)
def fulfill_order_items():
    payload = CustomerOrderItemBulkFulfill(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read = CustomerOrderItemDomain.fulfill_items(
            uow=uow,
            payload=payload)
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 200

@customer_order_item_blueprint.route('/unfulfill-items', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.OPERATION_MANAGER.value)
def unfulfill_order_items():
    payload = CustomerOrderItemBulkUnFulfill(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read = CustomerOrderItemDomain.unfulfill_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 200


@customer_order_item_blueprint.route('/bulk-delete', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_order_items():
    payload = CustomerOrderItemBulkDelete(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read = CustomerOrderItemDomain.delete_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 200