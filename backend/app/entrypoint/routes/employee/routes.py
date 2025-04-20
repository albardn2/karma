from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.employee import (
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    EmployeeReadList,
)
from models.common import Employee as EmployeeModel

from app.entrypoint.routes.employee import employee_blueprint


@employee_blueprint.route('/', methods=['POST'])
def create_employee():
    try:
        payload = EmployeeCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

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
            return jsonify({'message': 'Employee not found'}), 404
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')
    return jsonify(employee_data), 200


@employee_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_employee(uuid: str):
    try:
        payload = EmployeeUpdate(**request.json)
        data = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        emp = uow.employee_repository.find_one(uuid=uuid)
        if not emp or emp.is_deleted:
            return jsonify({'message': 'Employee not found'}), 404

        for field, val in data.items():
            setattr(emp, field, val)
        uow.employee_repository.save(model=emp, commit=True)
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')

    return jsonify(employee_data), 200


@employee_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_employee(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        emp = uow.employee_repository.find_one(uuid=uuid)
        if not emp or emp.is_deleted:
            return jsonify({'message': 'Employee not found'}), 404

        emp.is_deleted = True
        uow.employee_repository.save(model=emp, commit=True)
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')

    return jsonify(employee_data), 200


@employee_blueprint.route('/', methods=['GET'])
def list_employees():
    with SqlAlchemyUnitOfWork() as uow:
        all_emps = uow.employee_repository.find_all(is_deleted=False)
        items = [
            EmployeeRead.from_orm(e).model_dump(mode='json')
            for e in all_emps
        ]
        result = EmployeeReadList(employees=items, total_count=len(items)) \
            .model_dump(mode='json')
    return jsonify(result), 200
