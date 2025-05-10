from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.financial_account import (
    FinancialAccountCreate,
    FinancialAccountRead,
    FinancialAccountUpdate,
    FinancialAccountListParams,
    FinancialAccountPage,
)
from models.common import FinancialAccount as FinancialAccountModel

from app.entrypoint.routes.financial_account import financial_account_blueprint
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.auth import scopes_required

from app.domains.financial_account.domain import FinancialAccountDomain


@financial_account_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required("admin", "superuser")
def create_account():
    payload = FinancialAccountCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        current_user_uuid = get_jwt_identity()
        data = payload.model_dump(mode='json')
        acct = FinancialAccountModel(**data)
        acct.created_by_uuid = current_user_uuid
        uow.financial_account_repository.save(model=acct, commit=True)
        result = FinancialAccountRead.from_orm(acct).model_dump(mode='json')
    return jsonify(result), 201

@financial_account_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required("admin", "superuser")
def get_account(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        acct = uow.financial_account_repository.find_one(uuid=uuid, is_deleted=False)
        if not acct:
            raise NotFoundError("FinancialAccount not found")
        result = FinancialAccountRead.from_orm(acct).model_dump(mode='json')
    return jsonify(result), 200

@financial_account_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required("admin", "superuser")
def update_account(uuid: str):
    payload = FinancialAccountUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        acct_read = FinancialAccountDomain.update_financial_account(uow=uow, uuid=uuid, payload=payload)
        result = acct_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@financial_account_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required("admin", "superuser")
def delete_account(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        acct_read = FinancialAccountDomain.delete_financial_account(uow=uow, uuid=uuid)
        result = acct_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@financial_account_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required("admin", "superuser")
def list_accounts():
    params = FinancialAccountListParams(**request.args)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.financial_account_repository.find_all_paginated(
            is_deleted=False,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            FinancialAccountRead.from_orm(ac).model_dump(mode='json')
            for ac in page_obj.items
        ]
        result = FinancialAccountPage(
            accounts=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200