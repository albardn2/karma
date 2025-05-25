# app/entrypoint/routes/vendor.py

from flask import Blueprint, request, jsonify
from pydantic import ValidationError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.vendor import (
    VendorCreate,
    VendorRead,
    VendorUpdate,
    VendorReadList,
    VendorListParams,
    VendorPage
)
from models.common import Vendor as VendorModel

from app.entrypoint.routes.vendor import vendor_blueprint
from app.entrypoint.routes.common.errors import NotFoundError

from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.vendor import VendorCategory

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.auth import add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required

@vendor_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value
                 )
def create_vendor():
    current_user_uuid = get_jwt_identity()
    payload = VendorCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        if payload.email_address:
            existing_vendor = uow.vendor_repository.find_first(email_address=payload.email_address)
            if existing_vendor:
                raise BadRequestError(f"Email address {payload.email_address} already exists")
        data = payload.model_dump(mode='json')
        v = VendorModel(**data)
        uow.vendor_repository.save(model=v, commit=True)
        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')

    return jsonify(vendor_data), 201


@vendor_blueprint.route('/<string:uuid>', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 PermissionScope.ACCOUNTANT.value
                 )
def get_vendor(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        v = uow.vendor_repository.find_one(uuid=uuid,is_deleted=False)
        if not v:
            raise NotFoundError(f"Vendor not found with uuid: {uuid}")
        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')
    return jsonify(vendor_data), 200


@vendor_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value,
                 )
def update_vendor(uuid: str):
    payload = VendorUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        v = uow.vendor_repository.find_one(uuid=uuid,is_deleted=False)
        if not v:
            raise NotFoundError(f"Vendor not found with uuid: {uuid}")

        for field, val in data.items():
            if field =='email_address' and val != v.email_address:
                existing_vendor = uow.vendor_repository.find_one(email_address=val)
                if existing_vendor:
                    raise BadRequestError(f"Email address {val} already exists")
            setattr(v, field, val)
        uow.vendor_repository.save(model=v, commit=True)
        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')
    return jsonify(vendor_data), 200


@vendor_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value
                 )
def delete_vendor(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        v = uow.vendor_repository.find_one(uuid=uuid,is_deleted=False)
        if not v:
            raise NotFoundError(f"Vendor not found with uuid: {uuid}")
        # find relations:  purchase orders
        if uow.purchase_order_repository.find_first(vendor_uuid=uuid,is_deleted=False):
            raise BadRequestError(f"Vendor {uuid} has purchase orders")
        # find debit notes
        if uow.debit_note_repository.find_first(vendor_uuid=uuid,is_deleted=False):
            raise BadRequestError(f"Vendor {uuid} has debit notes")
        # find credit notes
        if uow.credit_note_repository.find_first(vendor_uuid=uuid,is_deleted=False):
            raise BadRequestError(f"Vendor {uuid} has credit notes")

        for k,val in v.balance_per_currency.items():
            if val != 0:
                raise BadRequestError(f"Vendor {uuid} has balance {val} in {k}")
        v.is_deleted = True
        uow.vendor_repository.save(model=v, commit=True)
        vendor_data = VendorRead.from_orm(v).model_dump(mode='json')

    return jsonify(vendor_data), 200


@vendor_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value,
                 PermissionScope.SUPER_ADMIN.value,
                 PermissionScope.OPERATION_MANAGER.value
                 )
def list_vendors():
    params = VendorListParams(**request.args)
    filters = [VendorModel.is_deleted == False]
    if params.uuid:
        filters.append(VendorModel.uuid == params.uuid)
    if params.category:
        filters.append(VendorModel.category == params.category)
    if params.company_name:
        filters.append(VendorModel.company_name.ilike(f"%{params.company_name}%"))
    if params.full_name:
        filters.append(VendorModel.full_name.ilike(f"%{params.full_name}%"))
    if params.phone_number:
        filters.append(VendorModel.phone_number.ilike(f"%{params.phone_number}%"))
    if params.email_address:
        filters.append(VendorModel.email_address.ilike(f"%{params.email_address}%"))
    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.vendor_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            VendorRead.from_orm(v).model_dump(mode='json')
            for v in page_obj.items
        ]
        result = VendorPage(
            vendors=items,
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages
        ).model_dump(mode='json')

    return jsonify(result), 200

@vendor_blueprint.route('/categories', methods=['GET'])
def list_vendor_categories():
    values = [cat.value for cat in VendorCategory]
    return jsonify(values), 200

