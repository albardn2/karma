# app/entrypoint/routes/debit_note_item/routes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.debit_note_item import (
    DebitNoteItemCreate,
    DebitNoteItemRead,
    DebitNoteItemUpdate,
    DebitNoteItemListParams,
    DebitNoteItemPage,
)
from models.common import DebitNoteItem as DebitNoteItemModel
from app.domains.debit_note_item.domain import DebitNoteItemDomain

from app.entrypoint.routes.debit_note import debit_note_item_blueprint


@debit_note_item_blueprint.route("/", methods=["POST"])
def create_debit_note_item():
    payload = DebitNoteItemCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = DebitNoteItemDomain.create_item(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201

@debit_note_item_blueprint.route("/<string:uuid>", methods=["GET"])
def get_debit_note_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.debit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("DebitNoteItem not found")
        dto = DebitNoteItemRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200
#
@debit_note_item_blueprint.route("/<string:uuid>", methods=["PUT"])
def update_debit_note_item(uuid: str):
    payload = DebitNoteItemUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode="json")
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.debit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("DebitNoteItem not found")
        for k, v in updates.items():
            setattr(m, k, v)
        uow.debit_note_item_repository.save(model=m, commit=True)
        dto = DebitNoteItemRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200

@debit_note_item_blueprint.route("/<string:uuid>", methods=["DELETE"])
def delete_debit_note_item(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = DebitNoteItemDomain.delete_item(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200
#
@debit_note_item_blueprint.route("/", methods=["GET"])
def list_debit_note_items():
    params = DebitNoteItemListParams(**request.args)
    filters = [DebitNoteItemModel.is_deleted == False]
    if params.uuid:
        filters.append(DebitNoteItemModel.uuid == params.uuid)
    if params.invoice_item_uuid:
        filters.append(DebitNoteItemModel.invoice_item_uuid == params.invoice_item_uuid)
    if params.customer_order_item_uuid:
        filters.append(DebitNoteItemModel.customer_order_item_uuid == params.customer_order_item_uuid)
    if params.purchase_order_item_uuid:
        filters.append(DebitNoteItemModel.purchase_order_item_uuid == params.purchase_order_item_uuid)
    if params.customer_uuid:
        filters.append(DebitNoteItemModel.customer_uuid == params.customer_uuid)
    if params.vendor_uuid:
        filters.append(DebitNoteItemModel.vendor_uuid == params.vendor_uuid)
    if params.status:
        filters.append(DebitNoteItemModel.status == params.status.value)
    if params.is_paid is not None:
        filters.append(DebitNoteItemModel.is_paid == params.is_paid)
    with SqlAlchemyUnitOfWork() as uow:
        page = uow.debit_note_item_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [DebitNoteItemRead.from_orm(m).model_dump(mode="json") for m in page.items]
        result = DebitNoteItemPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")
    return jsonify(result), 200
