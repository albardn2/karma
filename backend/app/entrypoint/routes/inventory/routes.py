from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.inventory import (
    InventoryCreate,
    InventoryRead,
    InventoryUpdate,
    InventoryListParams,
    InventoryPage,
)
from models.common import Inventory as InventoryModel
from app.domains.inventory.domain import InventoryDomain
from app.entrypoint.routes.inventory import inventory_blueprint


@inventory_blueprint.route('/', methods=['POST'])
def create_inventory():
    payload = InventoryCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        inv_read = InventoryDomain.create_inventory(uow=uow, payload=payload)
        result = inv_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 201

@inventory_blueprint.route('/<string:uuid>', methods=['GET'])
def get_inventory(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inv:
            raise NotFoundError('Inventory not found')
        result = InventoryRead.from_orm(inv)
        InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=result)
        result = result.model_dump(mode='json')
    return jsonify(result), 200
#
@inventory_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_inventory(uuid: str):
    payload = InventoryUpdate(**request.json)
    updates = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        inv = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inv:
            raise NotFoundError('Inventory not found')
        for field, val in updates.items():
            setattr(inv, field, val)
        uow.inventory_repository.save(model=inv, commit=True)
        result = InventoryRead.from_orm(inv).model_dump(mode='json')
    return jsonify(result), 200

@inventory_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_inventory(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        inv_read = InventoryDomain.delete_inventory(uow=uow, uuid=uuid)
        result = inv_read.model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200

@inventory_blueprint.route('/', methods=['GET'])
def list_inventories():
    params = InventoryListParams(**request.args)
    filters = [InventoryModel.is_deleted == False]
    if params.material_uuid:
        filters.append(InventoryModel.material_uuid == params.material_uuid)
    if params.warehouse_uuid:
        filters.append(InventoryModel.warehouse_uuid == params.warehouse_uuid)
    if params.is_active is not None:
        filters.append(InventoryModel.is_active == params.is_active)
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.inventory_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        # enrich items with cost per unit
        items = []
        for i in page_obj.items:
            dto = InventoryRead.from_orm(i)
            InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=i)
            items.append(dto.model_dump(mode='json'))
        # items = [InventoryRead.from_orm(i).model_dump(mode='json') for i in page_obj.items]
        result = InventoryPage(
            inventories=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200