from flask import  request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from pydantic import  ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.customer import customer_blueprint

from app.dto.customer import CustomerCreate, CustomerRead
from models.common import Customer as CustomerModel

from app.dto.customer import CustomerUpdate, CustomerReadList,CustomerListParams, CustomerPage
from app.entrypoint.routes.common.errors import BadRequestError
from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.customer import CustomerCategory
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload



@customer_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value)
def create_customer():
    current_uuid = get_jwt_identity()
    payload = CustomerCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_uuid, payload=payload)
        if uow.customer_repository.find_one(email_address=payload.email_address):
            raise BadRequestError(f"Customer with email {payload.email_address} already exists")

        cust = CustomerModel(**payload.model_dump())
        uow.customer_repository.save(model=cust, commit=True)
        customer_data = CustomerRead.from_orm(cust).model_dump(mode='json')

    return jsonify(customer_data), 201


@customer_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value)
def get_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid,is_deleted=False)
        if not customer:
            raise NotFoundError('Customer not found')
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')
    return jsonify(customer_data), 200


@customer_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def update_customer(uuid: str):
    payload = CustomerUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True)
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid, is_deleted=False)
        if not customer:
            return NotFoundError("Customer not found")

        if payload.email_address != customer.email_address:
            if uow.customer_repository.find_one(email_address=payload.email_address):
                raise BadRequestError(f"Customer with email {payload.email_address} already exists")

        customer.update(**data)
        uow.customer_repository.save(model=customer, commit=True)
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')

    return jsonify(customer_data), 200


@customer_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value)
def delete_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid, is_deleted=False)
        if not customer:
            raise NotFoundError("Customer not found")

        customer_orders = uow.customer_order_repository.find_all(uuid=uuid, is_deleted=False)
        if customer_orders:
            raise BadRequestError("Customer has orders and cannot be deleted")
        debit_note_items = uow.debit_note_item_repository.find_all(uuid=uuid, is_deleted=False)
        if debit_note_items:
            raise BadRequestError("Customer has debit notes and cannot be deleted")
        credit_note_items = uow.credit_note_item_repository.find_all(uuid=uuid, is_deleted=False)
        if credit_note_items:
            raise BadRequestError("Customer has credit notes and cannot be deleted")
        for k,v in customer.balance_per_currency.items():
            if v > 0:
                raise BadRequestError("Customer has balance and cannot be deleted")

        customer.is_deleted = True
        uow.customer_repository.save(model=customer, commit=True)
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')

    return jsonify(customer_data), 200


@customer_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.SALES.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.ACCOUNTANT.value)
def list_customers():
    # Parse & validate pagination params
    params = CustomerListParams(**request.args)
    filters = [CustomerModel.is_deleted == False]
    if params.uuid:
        filters.append(CustomerModel.uuid == params.uuid)
    if params.category:
        filters.append(CustomerModel.category == params.category.value)
    if params.customer_uuid:
        filters.append(CustomerModel.uuid == params.customer_uuid)
    if params.email_address:
        filters.append(CustomerModel.email_address == params.email_address)
    if params.company_name:
        filters.append(CustomerModel.company_name == params.company_name)
    if params.full_name:
        filters.append(CustomerModel.full_name == params.full_name)
    if params.phone_number:
        filters.append(CustomerModel.phone_number == params.phone_number)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.customer_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
            ordering=[CustomerModel.created_at.desc()]
        )
        items = [
            CustomerRead.from_orm(c).model_dump(mode='json')
            for c in page_obj.items
        ]
        result = CustomerPage(
            customers=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200


@customer_blueprint.route('/categories', methods=['GET'])
def list_customer_categories():
    categories = [category.value for category in CustomerCategory]
    return jsonify(categories), 200
