from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.pricing import (
    PricingCreate,
    PricingRead,
    PricingUpdate,
    PricingListParams,
    PricingPage,
)
from models.common import Pricing as PricingModel
from app.entrypoint.routes.pricing import pricing_blueprint
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import NotFoundError


@pricing_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required("admin", "superuser")
def create_pricing():
    payload = PricingCreate(**request.json)
    current_user_uuid = get_jwt_identity()
    payload.created_by_uuid = current_user_uuid
    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        pr = PricingModel(**data)
        uow.pricing_repository.save(model=pr, commit=True)
        pricing_data = PricingRead.from_orm(pr).model_dump(mode='json')

    return jsonify(pricing_data), 201

@pricing_blueprint.route('/<string:uuid>', methods=['GET'])
def get_pricing(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        pr = uow.pricing_repository.find_one(uuid=uuid, is_deleted=False)
        if not pr:
            return jsonify({'message': 'Pricing not found'}), 404
        pricing_data = PricingRead.from_orm(pr).model_dump(mode='json')

    return jsonify(pricing_data), 200

@pricing_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_pricing(uuid: str):
    payload = PricingUpdate(**request.json)
    data    = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        pr = uow.pricing_repository.find_one(uuid=uuid, is_deleted=False)
        if not pr:
            raise NotFoundError("Pricing not found")
        for field, val in data.items():
            setattr(pr, field, val)
        uow.pricing_repository.save(model=pr, commit=True)
        pricing_data = PricingRead.from_orm(pr).model_dump(mode='json')

    return jsonify(pricing_data), 200

@pricing_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_pricing(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        pr = uow.pricing_repository.find_one(uuid=uuid, is_deleted=False)
        if not pr:
            return jsonify({'message': 'Pricing not found'}), 404

        pr.is_deleted = True
        uow.pricing_repository.save(model=pr, commit=True)
        pricing_data = PricingRead.from_orm(pr).model_dump(mode='json')

    return jsonify(pricing_data), 200

@pricing_blueprint.route('/', methods=['GET'])
def list_pricings():

    params = PricingListParams(**request.args)
    filters = [PricingModel.is_deleted == False]
    if params.material_uuid:
        filters.append(PricingModel.material_uuid == params.material_uuid)
    if params.currency:
        filters.append(PricingModel.currency == params.currency.value)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.pricing_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            PricingRead.from_orm(p).model_dump(mode='json')
            for p in page_obj.items
        ]

        result = PricingPage(
            pricings=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200
