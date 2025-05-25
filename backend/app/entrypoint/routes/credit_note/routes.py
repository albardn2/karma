# app/entrypoint/routes/credit_note_item/routes.py
from flask import request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.credit_note_item import (
    CreditNoteItemCreate,
    CreditNoteItemRead,
    CreditNoteItemUpdate,
    CreditNoteItemListParams,
    CreditNoteItemPage,
)
from models.common import CreditNoteItem as CreditNoteItemModel
from app.domains.credit_note_item.domain import CreditNoteItemDomain

from app.entrypoint.routes.credit_note import credit_note_item_blueprint


@credit_note_item_blueprint.route("/", methods=["POST"])
def create_credit_note_item():
    payload = CreditNoteItemCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = CreditNoteItemDomain.create_item(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@credit_note_item_blueprint.route("/<string:uuid>", methods=["GET"])
def get_credit_note_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.credit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("CreditNoteItem not found")
        dto = CreditNoteItemRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200


@credit_note_item_blueprint.route("/<string:uuid>", methods=["PUT"])
def update_credit_note_item(uuid: str):
    payload = CreditNoteItemUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode="json")
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.credit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("CreditNoteItem not found")
        for k, v in updates.items():
            setattr(m, k, v)
        uow.credit_note_item_repository.save(model=m, commit=True)
        dto = CreditNoteItemRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200


@credit_note_item_blueprint.route("/<string:uuid>", methods=["DELETE"])
def delete_credit_note_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = CreditNoteItemDomain.delete_item(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@credit_note_item_blueprint.route("/", methods=["GET"])
def list_credit_note_items():
    params = CreditNoteItemListParams(**request.args)
    filters = [CreditNoteItemModel.is_deleted == False]

    if params.is_paid is not None:
        filters.append(CreditNoteItemModel.is_paid == params.is_paid)
    if params.uuid:
        filters.append(CreditNoteItemModel.uuid == params.uuid)
    if params.invoice_item_uuid:
        filters.append(CreditNoteItemModel.invoice_item_uuid == params.invoice_item_uuid)
    if params.customer_order_item_uuid:
        filters.append(CreditNoteItemModel.customer_order_item_uuid == params.customer_order_item_uuid)
    if params.purchase_order_item_uuid:
        filters.append(CreditNoteItemModel.purchase_order_item_uuid == params.purchase_order_item_uuid)
    if params.customer_uuid:
        filters.append(CreditNoteItemModel.customer_uuid == params.customer_uuid)
    if params.vendor_uuid:
        filters.append(CreditNoteItemModel.vendor_uuid == params.vendor_uuid)
    if params.status:
        filters.append(CreditNoteItemModel.status == params.status.value)

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.credit_note_item_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [CreditNoteItemRead.from_orm(m).model_dump(mode="json") for m in page.items]
        result = CreditNoteItemPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")
    return jsonify(result), 200
