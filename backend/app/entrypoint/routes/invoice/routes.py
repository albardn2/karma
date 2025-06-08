from flask import Blueprint, request, jsonify
from datetime import datetime
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.invoice import (
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceRead,
    InvoiceListParams,
    InvoicePage,
)
from models.common import Invoice as InvoiceModel

from app.entrypoint.routes.invoice import invoice_blueprint
from app.domains.invoice.domain import InvoiceDomain

from app.dto.invoice import InvoiceStatus
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@invoice_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def create_invoice():
    current_user_uuid = get_jwt_identity()
    payload = InvoiceCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        invoice_read = InvoiceDomain.create_invoice(uow=uow, payload=payload)
        result = invoice_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@invoice_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def get_invoice(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.invoice_repository.find_one(uuid=uuid,is_deleted=False)
        if not inv:
            raise NotFoundError('Invoice not found')
        result = InvoiceRead.from_orm(inv).model_dump(mode='json')
    return jsonify(result), 200
#
@invoice_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def update_invoice(uuid: str):
    payload = InvoiceUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        invoice_read = InvoiceDomain.update_invoice(uow=uow, uuid=uuid, payload=payload)
        result = invoice_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200
#
@invoice_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_invoice(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        invoice_read = InvoiceDomain.delete_invoice(uow=uow, uuid=uuid)
        result = invoice_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200
#
@invoice_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def list_invoices():
    params = InvoiceListParams(**request.args)
    filters = [InvoiceModel.is_deleted == False]
    if params.customer_uuid:
        filters.append(InvoiceModel.customer_uuid == params.customer_uuid)
    if params.status:
        filters.append(InvoiceModel.status == params.status.value)
    if params.customer_order_uuid:
        filters.append(InvoiceModel.customer_order_uuid == params.customer_order_uuid)
    if params.uuid:
        filters.append(InvoiceModel.uuid == params.uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.invoice_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [InvoiceRead.from_orm(i).model_dump(mode='json') for i in page_obj.items]
        result = InvoicePage(
            invoices=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200

@invoice_blueprint.route('/status', methods=['GET'])
def list_invoice_status():
    status_list = [status.value for status in InvoiceStatus]
    return jsonify(status_list), 200