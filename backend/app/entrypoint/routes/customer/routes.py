from flask import  request, jsonify
from pydantic import  ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.customer import customer_blueprint

from app.dto.customer import CustomerCreate, CustomerRead
from models.common import Customer as CustomerModel

from app.dto.customer import CustomerUpdate, CustomerReadList,CustomerListParams, CustomerPage


@customer_blueprint.route('/', methods=['POST'])
def create_customer():
    try:
        payload = CustomerCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        cust = CustomerModel(**payload.model_dump())
        uow.customer_repository.save(model=cust, commit=True)
        customer_data = CustomerRead.from_orm(cust).model_dump(mode='json')

    return jsonify(customer_data), 201


@customer_blueprint.route('/<string:uuid>', methods=['GET'])
def get_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid,is_deleted=False)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')
    return jsonify(customer_data), 200


@customer_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_customer(uuid: str):
    try:
        payload = CustomerUpdate(**request.json)
        data = payload.model_dump(exclude_unset=True)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404

        customer.update(**data)
        uow.customer_repository.save(model=customer, commit=True)
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')

    return jsonify(customer_data), 200


@customer_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        customer.is_deleted = True
        uow.customer_repository.save(model=customer, commit=True)
        customer_data = CustomerRead.from_orm(customer).model_dump(mode='json')

    return jsonify(customer_data), 200


@customer_blueprint.route('/', methods=['GET'])
def list_customers():
    # Parse & validate pagination params
    try:
        params = CustomerListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.customer_repository.find_all_paginated(
            is_deleted=False,
            **params.model_dump(exclude_none=True),
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
