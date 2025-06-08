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

from app.entrypoint.routes.common.errors import NotFoundError
from app.domains.fixed_asset.domain import FixedAssetDomain

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@fixed_asset_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value)
def create_fixed_asset():
    """Create a new fixed asset."""
    current_user_uuid = get_jwt_identity()
    payload = FixedAssetCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        fa_read = FixedAssetDomain.create_fixed_asset(uow=uow, payload=payload)
        result = fa_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@fixed_asset_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value)
def get_fixed_asset(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        fa = uow.fixed_asset_repository.find_one(uuid=uuid, is_deleted=False)
        if not fa:
            raise NotFoundError('FixedAsset not found')
        result = FixedAssetRead.from_orm(fa).model_dump(mode='json')
    return jsonify(result), 200

@fixed_asset_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value)
def update_fixed_asset(uuid: str):
    payload = FixedAssetUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        fa = uow.fixed_asset_repository.find_one(uuid=uuid, is_deleted=False)
        if not fa:
            raise NotFoundError('FixedAsset not found')
        for field, val in updates.items():
            setattr(fa, field, val)
        uow.fixed_asset_repository.save(model=fa, commit=True)
        result = FixedAssetRead.from_orm(fa).model_dump(mode='json')
    return jsonify(result), 200

@fixed_asset_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value)
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
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.ACCOUNTANT.value)
def list_fixed_assets():
    try:
        params = FixedAssetListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    # assemble filter kwargs
    filters = [FixedAssetModel.is_deleted == False]
    if params.uuid:
        filters.append(FixedAssetModel.uuid == params.uuid)
    if params.purchase_order_item_uuid:
        filters.append(FixedAssetModel.purchase_order_item_uuid == params.purchase_order_item_uuid)
    if params.material_uuid:
        filters.append(FixedAssetModel.material_uuid == params.material_uuid)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.fixed_asset_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
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