from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import PermissionScope
from app.dto.process_template import (
    ProcessTemplateCreate,
    ProcessTemplateRead,
    ProcessTemplateListParams,
    ProcessTemplatePage,
)
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.process_template import process_template_blueprint
from models.common import ProcessTemplate as ProcessTemplateModel

# same audience as process create — templates only pre-fill that form
SCOPES = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
)


@process_template_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(*SCOPES)
def create_process_template():
    payload = ProcessTemplateCreate(**request.json)
    current_user_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        m = ProcessTemplateModel(**payload.model_dump(mode="json"))
        uow.process_template_repository.save(model=m, commit=True)
        result = ProcessTemplateRead.from_orm(m).model_dump(mode="json")
    return jsonify(result), 201


@process_template_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(*SCOPES)
def list_process_templates():
    params = ProcessTemplateListParams(**request.args)
    filters = [ProcessTemplateModel.is_deleted.is_(False)]
    if params.name:
        filters.append(ProcessTemplateModel.name.ilike(f"%{params.name}%"))
    with SqlAlchemyUnitOfWork() as uow:
        page = uow.process_template_repository.find_all_by_filters_paginated(
            filters=filters, page=params.page, per_page=params.per_page
        )
        result = ProcessTemplatePage(
            items=[ProcessTemplateRead.from_orm(m).model_dump(mode="json") for m in page.items],
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200


@process_template_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(*SCOPES)
def delete_process_template(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.process_template_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("Process template not found")
        m.is_deleted = True
        uow.process_template_repository.save(model=m, commit=True)
    return jsonify({"uuid": uuid, "is_deleted": True}), 200
