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

from app.dto.employee import EmployeeRole

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required


@employee_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def create_employee():
    current_uuid = get_jwt_identity()
    payload = EmployeeCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_uuid, payload=payload)
        data = payload.model_dump(mode='json')
        emp = EmployeeModel(**data)
        uow.employee_repository.save(model=emp, commit=True)
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')

    return jsonify(employee_data), 201


@employee_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER)
def get_employee(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        emp = uow.employee_repository.find_one(uuid=uuid, is_deleted=False)
        if not emp:
            raise NotFoundError('Employee not found')
        employee_data = EmployeeRead.from_orm(emp).model_dump(mode='json')
    return jsonify(employee_data), 200


@employee_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
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
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
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
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value,
                 PermissionScope.OPERATION_MANAGER)
def list_employees():
    # Parse & validate pagination params
    params = EmployeeListParams(**request.args)
    filters = [EmployeeModel.is_deleted == False]
    if params.uuid:
        filters.append(EmployeeModel.uuid == params.uuid)
    if params.full_name:
        filters.append(EmployeeModel.full_name.ilike(f"%{params.full_name}%"))
    if params.phone_number:
        filters.append(EmployeeModel.phone_number.ilike(f"%{params.phone_number}%"))
    if params.email_address:
        filters.append(EmployeeModel.email_address.ilike(f"%{params.email_address}%"))
    if params.role:
        filters.append(EmployeeModel.role == params.role.value)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.employee_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
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

@employee_blueprint.route('/roles', methods=['GET'])
def list_roles():
    roles = [role.value for role in EmployeeRole]
    return jsonify(roles), 200
