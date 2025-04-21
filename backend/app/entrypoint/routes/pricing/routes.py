from flask import Blueprint, request, jsonify
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


@pricing_blueprint.route('/', methods=['POST'])
def create_pricing():
    try:
        payload = PricingCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

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
    try:
        payload = PricingUpdate(**request.json)
        data    = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        pr = uow.pricing_repository.find_one(uuid=uuid, is_deleted=False)
        if not pr:
            return jsonify({'message': 'Pricing not found'}), 404

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
    # Parse & validate pagination params
    try:
        params = PricingListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.pricing_repository.find_all_paginated(
            is_deleted=False,
            **params.model_dump(mode='json', exclude_none=True)
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
