from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.expense import (
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    ExpenseReadList,
    ExpenseListParams
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
    # Parse & validate query params into DTO
    try:
        params = ExpenseListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    # Convert DTO to simple dict for repository kwargs
    filter_params = params.model_dump(exclude_none=True)
    # Query using repository that accepts field‑value kwargs
    with SqlAlchemyUnitOfWork() as uow:
        exps = uow.expense_repository.find_all(is_deleted=False,**filter_params)
        items = [
            ExpenseRead.from_orm(e).model_dump(mode='json') for e in exps
        ]
        result = ExpenseReadList(expenses=items, total_count=len(items)).model_dump(mode='json')

    return jsonify(result), 200