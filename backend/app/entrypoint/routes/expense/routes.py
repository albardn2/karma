from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.expense import (
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    ExpenseReadList,
    ExpenseListParams,
    ExpensePage
)
from models.common import Expense as ExpenseModel
from app.entrypoint.routes.expense import expense_blueprint



@expense_blueprint.route('/', methods=['POST'])
def create_expense():
    try:
        payload = ExpenseCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        exp = ExpenseModel(**data)
        uow.expense_repository.save(model=exp, commit=True)
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')

    return jsonify(expense_data), 201


@expense_blueprint.route('/<string:uuid>', methods=['GET'])
def get_expense(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid, is_deleted=False)
        if not exp:
            return jsonify({'message': 'Expense not found'}), 404
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')

    return jsonify(expense_data), 200


@expense_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_expense(uuid: str):
    try:
        payload = ExpenseUpdate(**request.json)
        data = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid)
        if not exp or exp.is_deleted:
            return jsonify({'message': 'Expense not found'}), 404

        for field, val in data.items():
            setattr(exp, field, val)
        uow.expense_repository.save(model=exp, commit=True)
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')

    return jsonify(expense_data), 200


@expense_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_expense(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid)
        if not exp or exp.is_deleted:
            return jsonify({'message': 'Expense not found'}), 404

        exp.is_deleted = True
        uow.expense_repository.save(model=exp, commit=True)
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')

    return jsonify(expense_data), 200


@expense_blueprint.route('/', methods=['GET'])
def list_expenses():
    # Parse & validate query & pagination params
    try:
        params = ExpenseListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    # Build filters list based on DTO
    filters = [ExpenseModel.is_deleted == False]
    if params.vendor_uuid:
        filters.append(ExpenseModel.vendor_uuid == str(params.vendor_uuid))
    if params.category:
        filters.append(ExpenseModel.category == params.category.value)
    if params.min_amount is not None:
        filters.append(ExpenseModel.amount >= params.min_amount)
    if params.max_amount is not None:
        filters.append(ExpenseModel.amount <= params.max_amount)
    if params.start:
        filters.append(ExpenseModel.created_at >= params.start)
    if params.end:
        filters.append(ExpenseModel.created_at <= params.end)

    # remove deleted
    filters.append(ExpenseModel.is_deleted == False)

    # Fetch paginated results
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.expense_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )

        items = [
            ExpenseRead.from_orm(e).model_dump(mode='json')
            for e in page_obj.items
        ]

        # Build paginated response via DTO
        result = ExpensePage(
            expenses=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200