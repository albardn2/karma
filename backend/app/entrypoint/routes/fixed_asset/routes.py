from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.fixed_asset import (
    FixedAssetCreate,
    FixedAssetRead,
    FixedAssetUpdate,
    FixedAssetListParams,
    FixedAssetPage,
)
from models.common import FixedAsset as FixedAssetModel

from app.entrypoint.routes.fixed_asset import fixed_asset_blueprint


@fixed_asset_blueprint.route('/', methods=['POST'])
def create_fixed_asset():
    try:
        payload = FixedAssetCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        fa = FixedAssetModel(**data)
        uow.fixed_asset_repository.save(model=fa, commit=True)
        result = FixedAssetRead.from_orm(fa).model_dump(mode='json')
    return jsonify(result), 201

@fixed_asset_blueprint.route('/<string:uuid>', methods=['GET'])
def get_fixed_asset(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        fa = uow.fixed_asset_repository.find_one(uuid=uuid, is_deleted=False)
        if not fa:
            return jsonify({'message': 'FixedAsset not found'}), 404
        result = FixedAssetRead.from_orm(fa).model_dump(mode='json')
    return jsonify(result), 200

@fixed_asset_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_fixed_asset(uuid: str):
    try:
        payload = FixedAssetUpdate(**request.json)
        updates = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        fa = uow.fixed_asset_repository.find_one(uuid=uuid, is_deleted=False)
        if not fa:
            return jsonify({'message': 'FixedAsset not found'}), 404
        for field, val in updates.items():
            setattr(fa, field, val)
        uow.fixed_asset_repository.save(model=fa, commit=True)
        result = FixedAssetRead.from_orm(fa).model_dump(mode='json')
    return jsonify(result), 200

@fixed_asset_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_fixed_asset(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        fa = uow.fixed_asset_repository.find_one(uuid=uuid, is_deleted=False)
        if not fa:
            return jsonify({'message': 'FixedAsset not found'}), 404
        fa.is_deleted = True
        uow.fixed_asset_repository.save(model=fa, commit=True)
        result = FixedAssetRead.from_orm(fa).model_dump(mode='json')
    return jsonify(result), 200

@fixed_asset_blueprint.route('/', methods=['GET'])
def list_fixed_assets():
    try:
        params = FixedAssetListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    # assemble filter kwargs
    filters = {}
    if params.purchase_order_item_uuid:
        filters['purchase_order_item_uuid'] = params.purchase_order_item_uuid
    if params.material_uuid:
        filters['material_uuid'] = params.material_uuid

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.fixed_asset_repository.find_all_paginated(
            is_deleted=False,
            page=params.page,
            per_page=params.per_page,
            **filters
        )
        items = [FixedAssetRead.from_orm(fa).model_dump(mode='json') for fa in page_obj.items]
        result = FixedAssetPage(
            fixed_assets=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200