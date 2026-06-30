from flask import request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.transaction import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    TransactionListParams,
    TransactionPage,
)
from models.common import Transaction as TransactionModel
from app.entrypoint.routes.transaction import transaction_blueprint
from app.domains.transaction.domain import TransactionDomain
from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@transaction_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def create_transaction():
    current_user_uuid = get_jwt_identity()
    payload = TransactionCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        transaction_read = TransactionDomain.create_transaction(uow, payload)
        result = transaction_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@transaction_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def get_transaction(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        tx = uow.transaction_repository.find_one(uuid=uuid, is_deleted=False)
        if not tx:
            raise NotFoundError('Transaction not found')
        result = TransactionRead.from_orm(tx).model_dump(mode='json')
    return jsonify(result), 200

@transaction_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def update_transaction(uuid: str):
    payload = TransactionUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        tx = uow.transaction_repository.find_one(uuid=uuid, is_deleted=False)
        if not tx:
            raise NotFoundError('Transaction not found')
        for field, val in updates.items():
            setattr(tx, field, val)
        uow.transaction_repository.save(model=tx, commit=True)
        result = TransactionRead.from_orm(tx).model_dump(mode='json')
    return jsonify(result), 200

@transaction_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value
                 )
def delete_transaction(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        transaction_read = TransactionDomain.delete_transaction(uow, uuid)
        result = transaction_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@transaction_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def list_transactions():
    params = TransactionListParams(**request.args)
    # assemble SQLAlchemy filters
    filters = [TransactionModel.is_deleted == False]
    if params.from_account_uuid:
        filters.append(TransactionModel.from_account_uuid == params.from_account_uuid)
    if params.to_account_uuid:
        filters.append(TransactionModel.to_account_uuid == params.to_account_uuid)
    if params.start_date:
        filters.append(TransactionModel.created_at >= params.start_date)
    if params.end_date:
        filters.append(TransactionModel.created_at <= params.end_date)
    if params.uuid:
        filters.append(TransactionModel.uuid == params.uuid)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.transaction_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            TransactionRead.from_orm(t).model_dump(mode='json')
            for t in page_obj.items
        ]
        result = TransactionPage(
            transactions=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
