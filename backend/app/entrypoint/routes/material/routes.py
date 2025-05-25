from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.material import (
    MaterialCreate,
    MaterialRead,
    MaterialUpdate,
    MaterialListParams,
    MaterialPage
)
from models.common import Material as MaterialModel
from app.entrypoint.routes.material import material_blueprint
from app.entrypoint.routes.common.auth import scopes_required

from app.domains.material.domain import MaterialDomain


@material_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required("admin","superuser","manager")
def create_material():
    payload = MaterialCreate(**request.json)
    current_user_uuid = get_jwt_identity()
    payload.created_by_uuid = current_user_uuid
    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')
        m    = MaterialModel(**data)
        uow.material_repository.save(model=m, commit=True)
        material_data = MaterialRead.from_orm(m).model_dump(mode='json')
    return jsonify(material_data), 201



@material_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required("admin","superuser","manager")
def get_material(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.material_repository.find_one(uuid=uuid,is_deleted=False)
        if not m:
            return jsonify({'message': 'Material not found'}), 404
        material_data = MaterialRead.from_orm(m).model_dump(mode='json')
    return jsonify(material_data), 200



@material_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required("admin","superuser","manager")
def update_material(uuid: str):
    payload = MaterialUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        material_read = MaterialDomain.update_material(uow=uow, uuid=uuid,payload=payload)
        material_data = material_read.model_dump(mode='json')
        uow.commit()
    return jsonify(material_data), 200



@material_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required("admin","superuser","manager")
def delete_material(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        material_read = MaterialDomain.delete_material(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(material_read.model_dump(mode='json')), 200

@material_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required("admin","superuser","manager")
def list_materials():
    # Parse & validate pagination params
    params = MaterialListParams(**request.args)
    filters = [MaterialModel.is_deleted == False]
    if params.type:
        filters.append(MaterialModel.type == params.type.value)
    if params.sku:
        filters.append(MaterialModel.sku == params.sku)
    if params.name:
        filters.append(MaterialModel.name.ilike(f"%{params.name}%"))
    if params.uuid:
        filters.append(MaterialModel.uuid == params.uuid)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.material_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            MaterialRead.from_orm(m).model_dump(mode='json')
            for m in page_obj.items
        ]
        result = MaterialPage(
            materials=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')
    return jsonify(result), 200
