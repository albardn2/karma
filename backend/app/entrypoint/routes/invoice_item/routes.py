from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice_item import (
    InvoiceItemBulkCreate,
    InvoiceItemBulkRead,
    InvoiceItemCreate,
    InvoiceItemRead,
    InvoiceItemListParams,
    InvoiceItemPage,
    InvoiceItemBulkDelete,
)
from models.common import InvoiceItem as InvoiceItemModel
from app.domains.invoice_item.domain import InvoiceItemDomain

from app.entrypoint.routes.invoice_item import invoice_item_blueprint
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@invoice_item_blueprint.route('/bulk-create', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def bulk_create_invoice_items():
    current_user_uuid = get_jwt_identity()
    payload = InvoiceItemBulkCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        for item in payload.items:
            add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=item)
        bulk_read: InvoiceItemBulkRead = InvoiceItemDomain.create_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 201

@invoice_item_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def get_invoice_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        item = uow.invoice_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not item:
            raise NotFoundError('InvoiceItem not found')
        result = InvoiceItemRead.from_orm(item).model_dump(mode='json')
    return jsonify(result), 200
#
@invoice_item_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def list_invoice_items():
    params = InvoiceItemListParams(**request.args)
    filters = [InvoiceItemModel.is_deleted == False]
    if params.invoice_uuid:
        filters.append(InvoiceItemModel.invoice_uuid == params.invoice_uuid)
    if params.customer_order_item_uuid:
        filters.append(InvoiceItemModel.customer_order_item_uuid == params.customer_order_item_uuid)
    if params.uuid:
        filters.append(InvoiceItemModel.uuid == params.uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.invoice_item_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [InvoiceItemRead.from_orm(i).model_dump(mode='json') for i in page_obj.items]
        result = InvoiceItemPage(
            items=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
#
@invoice_item_blueprint.route('/bulk-delete', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def bulk_delete_invoice_items():
    payload = InvoiceItemBulkDelete(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        bulk_read: InvoiceItemBulkRead = InvoiceItemDomain.delete_items(
            uow=uow,
            payload=payload
        )
        uow.commit()
    return jsonify(bulk_read.model_dump(mode='json')), 200
