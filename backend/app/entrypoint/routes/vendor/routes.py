# app/entrypoint/routes/vendor.py

from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.vendor import (
    VendorCreate,
    VendorRead,
    VendorUpdate,
    VendorReadList,
)
from models.common import Vendor as VendorModel

from app.entrypoint.routes.vendor import vendor_blueprint


@vendor_blueprint.route('/', methods=['POST'])
def create_vendor():
    try:
        payload = VendorCreate(**request.json)
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        data = payload.model_dump(mode='json')          # enums → strings
        v = VendorModel(**data)
        uow.vendor_repository.save(model=v, commit=True)
        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')

    return jsonify(vendor_data), 201


@vendor_blueprint.route('/<string:uuid>', methods=['GET'])
def get_vendor(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        v = uow.vendor_repository.find_one(uuid=uuid,is_deleted=False)
        if not v:
            return jsonify({'message': 'Vendor not found'}), 404

        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')

    return jsonify(vendor_data), 200


@vendor_blueprint.route('/<string:uuid>', methods=['PUT'])
def update_vendor(uuid: str):
    try:
        payload = VendorUpdate(**request.json)
        data = payload.model_dump(exclude_unset=True, mode='json')
    except ValidationError as e:
        return jsonify(e.errors()), 400

    with SqlAlchemyUnitOfWork() as uow:
        v = uow.vendor_repository.find_one(uuid=uuid)
        if not v or v.is_deleted:
            return jsonify({'message': 'Vendor not found'}), 404

        for field, val in data.items():
            setattr(v, field, val)
        uow.vendor_repository.save(model=v, commit=True)

        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')

    return jsonify(vendor_data), 200


@vendor_blueprint.route('/<string:uuid>', methods=['DELETE'])
def delete_vendor(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        v = uow.vendor_repository.find_one(uuid=uuid)
        if not v or v.is_deleted:
            return jsonify({'message': 'Vendor not found'}), 404

        v.is_deleted = True
        uow.vendor_repository.save(model=v, commit=True)

        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')

    return jsonify(vendor_data), 200


@vendor_blueprint.route('/', methods=['GET'])
def list_vendors():
    with SqlAlchemyUnitOfWork() as uow:
        all_vendors = uow.vendor_repository.find_all(is_deleted=False)
        items = [
            VendorRead.from_orm(v).model_dump(mode='json')
            for v in all_vendors
        ]
        result = VendorReadList(
            vendors=items,
            total_count=len(items)
        ).model_dump(mode='json')

    return jsonify(result), 200
