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

from app.domains.expense.domain import ExpenseDomain
from app.entrypoint.routes.common.errors import NotFoundError


@expense_blueprint.route('/', methods=['POST'])
def create_expense():
    payload = ExpenseCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        expense_read = ExpenseDomain.create_expense(uow=uow, payload=payload)
        result = expense_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201


@expense_blueprint.route('/<string:uuid>', methods=['GET'])
def get_expense(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid, is_deleted=False)
        if not exp:
            raise NotFoundError(f"Expense with uuid {uuid} not found")
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')
    return jsonify(expense_data), 200

@expense_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_expense(uuid: str):
    payload = ExpenseUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        exp = uow.expense_repository.find_one(uuid=uuid,is_deleted=False)
        if not exp:
            raise NotFoundError(f"Expense with uuid {uuid} not found")

        for field, val in data.items():
            setattr(exp, field, val)
        uow.expense_repository.save(model=exp, commit=True)
        expense_data = ExpenseRead.from_orm(exp).model_dump(mode='json')

    return jsonify(expense_data), 200


@expense_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_expense(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = ExpenseDomain.delete_expense(uuid=uuid, uow=uow)
        result = dto.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200


@expense_blueprint.route('/', methods=['GET'])
def list_expenses():
    # Parse & validate query & pagination params
    params = ExpenseListParams(**request.args)

    # Build filters list based on DTO
    filters = [ExpenseModel.is_deleted == False]
    if params.uuid:
        filters.append(ExpenseModel.uuid == str(params.uuid))
    if params.vendor_uuid:
        filters.append(ExpenseModel.vendor_uuid == str(params.vendor_uuid))
    if params.category:
        filters.append(ExpenseModel.category == params.category.value)
    if params.start:
        filters.append(ExpenseModel.created_at >= params.start)
    if params.end:
        filters.append(ExpenseModel.created_at <= params.end)
    if params.status:
        filters.append(ExpenseModel.status == params.status.value)
    if params.is_paid is not None:
        filters.append(ExpenseModel.is_paid == params.is_paid)

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