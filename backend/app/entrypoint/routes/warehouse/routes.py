from flask import request, jsonify
from geoalchemy2 import WKTElement
from pydantic import ValidationError
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.warehouse import (
    WarehouseCreate,
    WarehouseRead,
    WarehouseUpdate,
    WarehouseListParams,
    WarehousePage,
)

from models.common import Warehouse as WarehouseModel
from app.entrypoint.routes.warehouse import warehouse_blueprint
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@warehouse_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value,
                 PermissionScope.ACCOUNTANT.value

                 )
def create_warehouse():
    current_user_uuid = get_jwt_identity()
    payload = WarehouseCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        data = payload.model_dump(mode='json',exclude_unset=True)
        wh = WarehouseModel(**data)
        if uow.warehouse_repository.find_first(name=wh.name):
            raise BadRequestError("Warehouse with this name already exists")
        uow.warehouse_repository.save(model=wh, commit=True)
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 201

@warehouse_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value,
                 PermissionScope.ACCOUNTANT.value

                 )
def get_warehouse(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            raise NotFoundError("Warehouse not found")
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 200

@warehouse_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def update_warehouse(uuid: str):
    payload = WarehouseUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            raise NotFoundError("Warehouse not found")
        for field, val in updates.items():
            setattr(wh, field, val)
        uow.warehouse_repository.save(model=wh, commit=True)
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 200

@warehouse_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 )
def delete_warehouse(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            raise NotFoundError("Warehouse not found")
        if uow.inventory_repository.find_first(warehouse_uuid=wh.uuid, is_deleted=False):
            raise BadRequestError("Cannot delete warehouse, inventories exist")
        wh.is_deleted = True
        uow.warehouse_repository.save(model=wh, commit=True)
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 200

@warehouse_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.OPERATOR.value,
                 PermissionScope.DRIVER.value,
                 PermissionScope.SALES.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def list_warehouses():
    params = WarehouseListParams(**request.args)
    filters = [WarehouseModel.is_deleted == False]
    if params.uuid:
        filters.append(WarehouseModel.uuid == params.uuid)
    if params.name:
        filters.append(WarehouseModel.name.ilike(f"%{params.name}%"))
    if params.within_polygon:
        try:
            # Wrap your WKT string in a WKTElement (with the correct SRID)
            poly = WKTElement(
                params.within_polygon,
                srid=WarehouseModel.coordinates.type.srid  # e.g. 4326
            )
            # Add the ST_Within filter
            filters.append(
                # call the ST_Within comparator
                # coordinates cannot be None
                WarehouseModel.coordinates.ST_Within(poly)  # type: ignore[call-overload,attr-defined]

            )
            filters.append(WarehouseModel.coordinates.is_not(None))  # ensure coordinates are not None
            # bump per_page so your polygon filter returns everything
            params.per_page = 10000
        except ValidationError as e:
            raise BadRequestError(f"Invalid polygon: {e}")
    if params.within_polygon:
        # make per page a very high number to avoid pagination
        params.per_page = 10000
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.warehouse_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            WarehouseRead.from_orm(w).model_dump(mode='json')
            for w in page_obj.items
        ]
        result = WarehousePage(
            warehouses=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200