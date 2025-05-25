# app/entrypoint/routes/payout/routes.py
from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.payout import (
    PayoutCreate,
    PayoutRead,
    PayoutUpdate,
    PayoutListParams,
    PayoutPage,
)
from models.common import Payout as PayoutModel
from app.domains.payout.domain import PayoutDomain
from app.entrypoint.routes.payout import payout_blueprint


@payout_blueprint.route('/', methods=['POST'])
def create_payout():
    payload = PayoutCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        payout_read = PayoutDomain.create_payout(uow=uow, payload=payload)
        result = payout_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@payout_blueprint.route('/<string:uuid>', methods=['GET'])
def get_payout(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        po = uow.payout_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError('Payout not found')
        result = PayoutRead.from_orm(po).model_dump(mode='json')
    return jsonify(result), 200

@payout_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_payout(uuid: str):
    payload = PayoutUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        po = uow.payout_repository.find_one(uuid=uuid, is_deleted=False)
        if not po:
            raise NotFoundError('Payout not found')
        for field, val in updates.items():
            setattr(po, field, val)
        uow.payout_repository.save(model=po, commit=True)
        result = PayoutRead.from_orm(po).model_dump(mode='json')
    return jsonify(result), 200

@payout_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_payout(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        payout_read = PayoutDomain.delete_payout(uow=uow, uuid=uuid)
        result = payout_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@payout_blueprint.route('/', methods=['GET'])
def list_payouts():
    params = PayoutListParams(**request.args)
    filters = [PayoutModel.is_deleted == False]
    if params.uuid:
        filters.append(PayoutModel.uuid == params.uuid)
    if params.credit_note_item_uuid:
        filters.append(PayoutModel.credit_note_item_uuid == params.credit_note_item_uuid)
    if params.purchase_order_uuid:
        filters.append(PayoutModel.purchase_order_uuid == params.purchase_order_uuid)
    if params.expense_uuid:
        filters.append(PayoutModel.expense_uuid == params.expense_uuid)
    if params.employee_uuid:
        filters.append(PayoutModel.employee_uuid == params.employee_uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.payout_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [PayoutRead.from_orm(p).model_dump(mode='json') for p in page_obj.items]
        result = PayoutPage(
            payouts=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
