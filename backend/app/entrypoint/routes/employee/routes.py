from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.employee import (
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    EmployeeListParams,
    EmployeePage
)
from models.common import Employee as EmployeeModel

from app.entrypoint.routes.employee import employee_blueprint
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError


@employee_blueprint.route('/', methods=['POST'])
def create_employee():
    payload = EmployeeCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        emp = EmployeeModel(**data)
        uow.employee_repository.save(model=emp, commit=True)
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')

    return jsonify(employee_data), 201


@employee_blueprint.route('/<string:uuid>', methods=['GET'])
def get_employee(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        emp = uow.employee_repository.find_one(uuid=uuid, is_deleted=False)
        if not emp:
            raise NotFoundError('Employee not found')
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')
    return jsonify(employee_data), 200


@employee_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_employee(uuid: str):
    payload = EmployeeUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        emp = uow.employee_repository.find_one(uuid=uuid, is_deleted=False)
        if not emp:
            raise NotFoundError('Employee not found')
        for field, val in data.items():
            setattr(emp, field, val)
        uow.employee_repository.save(model=emp, commit=True)
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')

    return jsonify(employee_data), 200


@employee_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_employee(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        emp = uow.employee_repository.find_one(uuid=uuid, is_deleted=False)
        if not emp:
            raise NotFoundError('Employee not found')

        payouts = [p for p in emp.payouts if not p.is_deleted]
        if payouts:
            raise BadRequestError('Cannot delete employee with active payouts')

        emp.is_deleted = True
        uow.employee_repository.save(model=emp, commit=True)
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')

    return jsonify(employee_data), 200


@employee_blueprint.route('/', methods=['GET'])
def list_employees():
    # Parse & validate pagination params
    params = EmployeeListParams(**request.args)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.employee_repository.find_all_paginated(
            page=params.page,
            per_page=params.per_page,
            is_deleted=False
        )
        items = [
            EmployeeRead.from_orm(e).model_dump(mode='json')
            for e in page_obj.items
        ]

        result = EmployeePage(
            employees=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200
