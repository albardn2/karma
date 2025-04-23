from flask import Blueprint, request, jsonify
from pydantic import ValidationError

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


@financial_account_blueprint.route('/', methods=['POST'])
def create_account():
    try:
        payload = FinancialAccountCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        acct = FinancialAccountModel(**data)
        uow.financial_account_repository.save(model=acct, commit=True)
        result = FinancialAccountRead.from_orm(acct).model_dump(mode='json')
    return jsonify(result), 201

@financial_account_blueprint.route('/<string:uuid>', methods=['GET'])
def get_account(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        acct = uow.financial_account_repository.find_one(uuid=uuid, is_deleted=False)
        if not acct:
            return jsonify({'message': 'FinancialAccount not found'}), 404
        result = FinancialAccountRead.from_orm(acct).model_dump(mode='json')
    return jsonify(result), 200

@financial_account_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_account(uuid: str):
    try:
        payload = FinancialAccountUpdate(**request.json)
        updates = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        acct = uow.financial_account_repository.find_one(uuid=uuid, is_deleted=False)
        if not acct:
            return jsonify({'message': 'FinancialAccount not found'}), 404
        for field, val in updates.items():
            setattr(acct, field, val)
        uow.financial_account_repository.save(model=acct, commit=True)
        result = FinancialAccountRead.from_orm(acct).model_dump(mode='json')
    return jsonify(result), 200

@financial_account_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_account(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        acct = uow.financial_account_repository.find_one(uuid=uuid, is_deleted=False)
        if not acct:
            return jsonify({'message': 'FinancialAccount not found'}), 404
        acct.is_deleted = True
        uow.financial_account_repository.save(model=acct, commit=True)
        result = FinancialAccountRead.from_orm(acct).model_dump(mode='json')
    return jsonify(result), 200

@financial_account_blueprint.route('/', methods=['GET'])
def list_accounts():
    try:
        params = FinancialAccountListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

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