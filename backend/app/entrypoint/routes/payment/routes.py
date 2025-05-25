from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.payment import (
    PaymentCreate,
    PaymentRead,
    PaymentUpdate,
    PaymentListParams,
    PaymentPage,
)
from models.common import Payment as PaymentModel
from app.domains.payment.domain import PaymentDomain
from app.entrypoint.routes.payment import payment_blueprint
from app.dto.common_enums import Currency
from app.dto.payment import PaymentMethod

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@payment_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def create_payment():
    current_user_uuid = get_jwt_identity()
    payload = PaymentCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        payment_read = PaymentDomain.create_payment(uow=uow, payload=payload)
        result = payment_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@payment_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def get_payment(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        pay = uow.payment_repository.find_one(uuid=uuid, is_deleted=False)
        if not pay:
            raise NotFoundError('Payment not found')
        result = PaymentRead.from_orm(pay).model_dump(mode='json')
    return jsonify(result), 200
#
@payment_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def update_payment(uuid: str):
    payload = PaymentUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        pay = uow.payment_repository.find_one(uuid=uuid, is_deleted=False)
        if not pay:
            raise NotFoundError('Payment not found')
        for field, val in updates.items():
            setattr(pay, field, val)
        uow.payment_repository.save(model=pay, commit=True)
        result = PaymentRead.from_orm(pay).model_dump(mode='json')
    return jsonify(result), 200
#
@payment_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value
                 )
def delete_payment(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        payment_read = PaymentDomain.delete_payment(uow=uow, uuid=uuid)
        result = payment_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200
#
@payment_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def list_payments():
    params = PaymentListParams(**request.args)
    filters = [PaymentModel.is_deleted == False]
    if params.debit_note_item_uuid:
        filters.append(PaymentModel.debit_note_item_uuid == params.debit_note_item_uuid)
    if params.uuid:
        filters.append(PaymentModel.uuid == params.uuid)
    if params.invoice_uuid:
        filters.append(PaymentModel.invoice_uuid == params.invoice_uuid)
    if params.financial_account_uuid:
        filters.append(PaymentModel.financial_account_uuid == params.financial_account_uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.payment_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [PaymentRead.from_orm(p).model_dump(mode='json') for p in page_obj.items]
        result = PaymentPage(
            payments=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200

# currency enum route list
@payment_blueprint.route('/currencies', methods=['GET'])
def list_currencies():
    currencies = [currency.value for currency in Currency]
    return jsonify(currencies), 200


@payment_blueprint.route('/payment-methods', methods=['GET'])
def list_payment_methods():
    payment_methods = [method.value for method in PaymentMethod]
    return jsonify(payment_methods), 200