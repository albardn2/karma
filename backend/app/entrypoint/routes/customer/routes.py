from flask import  request, jsonify
from pydantic import  ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.customer import customer_blueprint

from app.dto.customer import CustomerCreate, CustomerRead
from models.common import Customer as CustomerModel
from app.dto.customer import CustomerUpdate
from app.dto.customer import CustomerReadList


@customer_blueprint.route('/', methods=['POST'])
def create_customer():
    try:
        payload = CustomerCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        cust = CustomerModel(**payload.dict())
        uow.customer_repository.save(model=cust,commit=True)
        customer_read = CustomerRead.from_orm(cust).dict()

    return jsonify(customer_read), 201



@customer_blueprint.route('/<string:uuid>', methods=['GET'])
def get_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        customer_read = CustomerRead.from_orm(customer).dict()
    return jsonify(customer_read), 200

@customer_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_customer(uuid: str):
    try:
        payload = CustomerUpdate(**request.json)
        payload = payload.dict(exclude_unset=True)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        customer.update(**payload)
        uow.customer_repository.save(model=customer, commit=True)
        customer_read = CustomerRead.from_orm(customer).dict()

    return jsonify(customer_read), 200

@customer_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_customer(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer = uow.customer_repository.find_one(uuid=uuid)
        if not customer:
            return jsonify({'message': 'Customer not found'}), 404
        customer.is_deleted = True
        uow.customer_repository.save(model=customer, commit=True)
        customer_delete = CustomerRead.from_orm(customer).dict()

    return jsonify(customer_delete), 200


@customer_blueprint.route('/', methods=['GET'])
def get_customers():
    with SqlAlchemyUnitOfWork() as uow:
        customers = uow.customer_repository.find_all(is_deleted=False)
        customers_read = [CustomerRead.from_orm(customer).dict() for customer in customers]
        total_count = len(customers_read)
        customer_read_list = CustomerReadList(customers=customers_read, total_count=total_count).dict()

    return jsonify(customer_read_list), 200



