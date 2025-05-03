# app/entrypoint/routes/process/routes.py
from flask import Blueprint, request, jsonify
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.process import (
    ProcessCreate,
    ProcessRead,
    ProcessUpdate,
    ProcessListParams,
    ProcessPage,
)
from models.common import Process as ProcessModel
from app.domains.process.domain import ProcessDomain

from app.entrypoint.routes.process import process_blueprint


@process_blueprint.route("/", methods=["POST"])
def create_process():
    payload = ProcessCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = ProcessDomain.create_process(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@process_blueprint.route("/<string:uuid>", methods=["GET"])
def get_process(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.process_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("Process not found")
        dto = ProcessRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200


@process_blueprint.route("/<string:uuid>", methods=["PUT"])
def update_process(uuid: str):
    payload = ProcessUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = ProcessDomain.update_process(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@process_blueprint.route("/<string:uuid>", methods=["DELETE"])
def delete_process(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        dto = ProcessDomain.delete_process(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@process_blueprint.route("/", methods=["GET"])
def list_processes():
    params = ProcessListParams(**request.args)
    filters = [ProcessModel.is_deleted == False]
    if params.type:
        filters.append(ProcessModel.type == params.type)
    if params.created_by_uuid:
        filters.append(ProcessModel.created_by_uuid == params.created_by_uuid)

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.process_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page
        )
        items = [
            ProcessRead.from_orm(m).model_dump(mode="json")
            for m in page.items
        ]
        result = ProcessPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages
        ).model_dump(mode="json")
    return jsonify(result), 200
