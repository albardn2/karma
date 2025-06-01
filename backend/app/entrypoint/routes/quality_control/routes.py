# app/entrypoint/routes/quality_control/routes.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from typing import Optional
from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from app.dto.auth import PermissionScope

from app.dto.quality_control import (
    QualityControlCreate,
    QualityControlRead,
    QualityControlUpdate,
    QualityControlListParams,
    QualityControlPage,
    QualityControlType,
)
from models.common import QualityControl as QualityControlModel
from app.domains.quality_control.domain import QualityControlDomain
from app.entrypoint.routes.quality_control import quality_control_blueprint

@quality_control_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR,
    PermissionScope.OPERATION_MANAGER,
)
def create_quality_control():
    """
    Create a new QualityControl record.
    """
    current_user_uuid = get_jwt_identity()
    payload = QualityControlCreate(**request.json)

    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = QualityControlDomain.create_quality_control(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@quality_control_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR,
    PermissionScope.OPERATION_MANAGER,
)
def get_quality_control(uuid: str):
    """
    Fetch a single QualityControl by UUID.
    """
    with SqlAlchemyUnitOfWork() as uow:
        qc = uow.quality_control_repository.find_one(uuid=uuid)
        if not qc:
            raise NotFoundError("QualityControl not found")
        dto = QualityControlRead.from_orm(qc).model_dump(mode="json")
    return jsonify(dto), 200
#

# @quality_control_blueprint.route("/<string:uuid>", methods=["PUT"])
# @jwt_required()
# @scopes_required(
#     PermissionScope.ADMIN.value,
#     PermissionScope.SUPER_ADMIN.value,
#     PermissionScope.OPERATOR,
#     PermissionScope.OPERATION_MANAGER,
# )
# def update_quality_control(uuid: str):
#     """
#     Update notes and/or data on an existing QualityControl.
#     """
#     payload = QualityControlUpdate(**request.json)
#     with SqlAlchemyUnitOfWork() as uow:
#         dto = QualityControlDomain.update_quality_control(uow=uow, uuid=uuid, payload=payload)
#         uow.commit()
#     return jsonify(dto.model_dump(mode="json")), 200
#

# @quality_control_blueprint.route("/<string:uuid>", methods=["DELETE"])
# @jwt_required()
# @scopes_required(
#     PermissionScope.ADMIN.value,
#     PermissionScope.SUPER_ADMIN.value,
#     PermissionScope.OPERATOR,
#     PermissionScope.OPERATION_MANAGER,
# )
# def delete_quality_control(uuid: str):
#     """
#     Soft-delete an existing QualityControl.
#     """
#     with SqlAlchemyUnitOfWork() as uow:
#         dto = QualityControlDomain.delete_quality_control(uow=uow, uuid=uuid)
#         uow.commit()
#     return jsonify(dto.model_dump(mode="json")), 200


@quality_control_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR,
    PermissionScope.OPERATION_MANAGER,
)
def list_quality_controls():
    """
    List / paginate QualityControl records with optional filters:
      - uuid
      - process_uuid
      - type
      - created_by_uuid
      - start_date / end_date
    """
    params = QualityControlListParams(**request.args)
    filters = []

    if params.uuid:
        filters.append(QualityControlModel.uuid == params.uuid)
    if params.process_uuid:
        filters.append(QualityControlModel.process_uuid == params.process_uuid)
    if params.type:
        filters.append(QualityControlModel.type == params.type)
    if params.created_by_uuid:
        filters.append(QualityControlModel.created_by_uuid == params.created_by_uuid)
    if params.start_date:
        filters.append(QualityControlModel.created_at >= params.start_date)
    if params.end_date:
        filters.append(QualityControlModel.created_at <= params.end_date)

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.quality_control_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            QualityControlRead.from_orm(qc).model_dump(mode="json")
            for qc in page.items
        ]
        result = QualityControlPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")

    return jsonify(result), 200


@quality_control_blueprint.route("/types", methods=["GET"])
def list_quality_control_types():
    """
    Return all possible QualityControlType values.
    """
    return jsonify([t.value for t in QualityControlType]), 200
