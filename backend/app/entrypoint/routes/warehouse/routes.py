from flask import request, jsonify
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


@warehouse_blueprint.route('/', methods=['POST'])
def create_warehouse():
    try:
        payload = WarehouseCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json',exclude_unset=True)
        wh = WarehouseModel(**data)
        uow.warehouse_repository.save(model=wh, commit=True)
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 201

@warehouse_blueprint.route('/<string:uuid>', methods=['GET'])
def get_warehouse(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            return jsonify({'message': 'Warehouse not found'}), 404
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 200

@warehouse_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_warehouse(uuid: str):
    try:
        payload = WarehouseUpdate(**request.json)
        updates = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            return jsonify({'message': 'Warehouse not found'}), 404
        for field, val in updates.items():
            setattr(wh, field, val)
        uow.warehouse_repository.save(model=wh, commit=True)
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 200

@warehouse_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_warehouse(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        wh = uow.warehouse_repository.find_one(uuid=uuid, is_deleted=False)
        if not wh:
            return jsonify({'message': 'Warehouse not found'}), 404
        wh.is_deleted = True
        uow.warehouse_repository.save(model=wh, commit=True)
        result = WarehouseRead.from_orm(wh).model_dump(mode='json')
    return jsonify(result), 200

@warehouse_blueprint.route('/', methods=['GET'])
def list_warehouses():
    try:
        params = WarehouseListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.warehouse_repository.find_all_paginated(
            is_deleted=False,
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