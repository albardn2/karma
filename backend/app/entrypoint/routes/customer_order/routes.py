from flask import Blueprint, request, jsonify
from datetime import datetime
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.customer_order import (
    CustomerOrderCreate,
    CustomerOrderRead,
    CustomerOrderUpdate,
    CustomerOrderListParams,
    CustomerOrderPage,
)
from models.common import CustomerOrder as CustomerOrderModel
from app.entrypoint.routes.customer_order import customer_order_blueprint
from app.domains.customer_order.domain import CustomerOrderDomain
from app.dto.customer_order import CustomerOrderWithItemsAndInvoiceCreate
from app.dto.customer_order import CustomerOrderWithItemsAndInvoiceRead

from app.dto.customer_order_item import CustomerOrderItemBulkRead, CustomerOrderItemRead


# ----------------------- CUSTOMER ORDER WITH ITEMS AND INVOICES -----------------

@customer_order_blueprint.route("/with-items-and-invoice", methods=["POST"])
def create_customer_order_with_items_and_invoice():
    payload = CustomerOrderWithItemsAndInvoiceCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        full_read = CustomerOrderDomain.create_customer_order_with_items_and_invoice(uow=uow, payload=payload)
        result = full_read.model_dump(mode="json")
        uow.commit()
    return jsonify(result), 201


@customer_order_blueprint.route("/with-items-and-invoice/<string:uuid>", methods=["GET"])
def get_customer_order_with_items_and_invoice(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        cus_order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not cus_order:
            raise NotFoundError("CustomerOrder not found")

        dto=CustomerOrderWithItemsAndInvoiceRead.from_customer_order_model(cus_order)
        result = dto.model_dump(mode="json")
    return jsonify(result), 201


@customer_order_blueprint.route("/with-items-and-invoice/<string:uuid>", methods=["DELETE"])
def delete_customer_order_with_items_and_invoice(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = CustomerOrderDomain.delete_customer_order_with_items_and_invoice(uuid=uuid, uow=uow)
        result = dto.model_dump(mode="json")
        uow.commit()
    return jsonify(result), 201



# ----------------------- CUSTOMER ORDER -----------------------
@customer_order_blueprint.route("/", methods=["POST"])
def create_customer_order():
    payload = CustomerOrderCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        customer_order_read = CustomerOrderDomain.create_customer_order(uow=uow, payload=payload)
        uow.commit()
        result = customer_order_read.model_dump(mode="json")
    return jsonify(result), 201

@customer_order_blueprint.route("/<string:uuid>", methods=["GET"])
def get_customer_order(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        order = uow.customer_order_repository.find_one(uuid=uuid, is_deleted=False)
        if not order:
            raise NotFoundError("CustomerOrder not found")
        result = CustomerOrderRead.from_orm(order).model_dump(mode="json")
        uow.commit()
    return jsonify(result), 200
#
@customer_order_blueprint.route("/<string:uuid>", methods=["PUT"])
def update_customer_order(uuid: str):
    payload = CustomerOrderUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        customer_order_read = CustomerOrderDomain.update_customer_order(uuid=uuid,uow=uow, payload=payload)
        result = customer_order_read.model_dump(mode="json")
        uow.commit()
    return jsonify(result), 200
#
@customer_order_blueprint.route("/<string:uuid>", methods=["DELETE"])
def delete_customer_order(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        customer_order_read = CustomerOrderDomain.delete_customer_order(uuid=uuid, uow=uow)
        result = customer_order_read.model_dump(mode="json")
        uow.commit()
    return jsonify(result), 200

@customer_order_blueprint.route("/", methods=["GET"])
def list_customer_orders():
    params = CustomerOrderListParams(**request.args)
    filters = [CustomerOrderModel.is_deleted == False]

    if params.uuid is not None:
        filters.append(CustomerOrderModel.uuid == params.uuid)
    if params.customer_uuid:
        filters.append(CustomerOrderModel.customer_uuid == params.customer_uuid)
    if params.is_paid is not None:
        filters.append(CustomerOrderModel.is_paid == params.is_paid)
    if params.is_fulfilled is not None:
        filters.append(CustomerOrderModel.is_fulfilled == params.is_fulfilled)
    if params.is_overdue is not None:
        filters.append(CustomerOrderModel.is_overdue == params.is_overdue)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.customer_order_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [CustomerOrderRead.from_orm(o).model_dump(mode="json") for o in page_obj.items]
        result = CustomerOrderPage(
            orders=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode="json")
    return jsonify(result), 200
