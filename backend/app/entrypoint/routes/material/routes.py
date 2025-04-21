from flask import Blueprint, request, jsonify
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


@material_blueprint.route('/', methods=['POST'])
def create_material():
    try:
        payload = MaterialCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        # use mode='json' so enums -> strings, and field names line up
        data = payload.model_dump(mode='json')
        m    = MaterialModel(**data)
        uow.material_repository.save(model=m, commit=True)

        material_data = MaterialRead.from_orm(m).model_dump(mode='json')
    return jsonify(material_data), 201


@material_blueprint.route('/<string:uuid>', methods=['GET'])
def get_material(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.material_repository.find_one(uuid=uuid,is_deleted=False)
        if not m:
            return jsonify({'message': 'Material not found'}), 404
        material_data = MaterialRead.from_orm(m).model_dump(mode='json')
    return jsonify(material_data), 200


@material_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_material(uuid: str):
    try:
        payload = MaterialUpdate(**request.json)
        data    = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        m = uow.material_repository.find_one(uuid=uuid)
        if not m:
            return jsonify({'message': 'Material not found'}), 404

        for field, val in data.items():
            setattr(m, field, val)
        uow.material_repository.save(model=m, commit=True)

        material_data = MaterialRead.from_orm(m).model_dump(mode='json')
    return jsonify(material_data), 200


@material_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_material(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.material_repository.find_one(uuid=uuid)
        if not m:
            return jsonify({'message': 'Material not found'}), 404
        m.is_deleted = True
        uow.material_repository.save(model=m, commit=True)
        material_data = MaterialRead.from_orm(m).model_dump(mode='json')
    return jsonify(material_data), 200


@material_blueprint.route('/', methods=['GET'])
def list_materials():
    # Parse & validate pagination params
    try:
        params = MaterialListParams(**request.args)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.material_repository.find_all_paginated(
            page=params.page,
            per_page=params.per_page,
            is_deleted=False
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
