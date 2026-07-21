# app/entrypoint/routes/trip_stop/routes.py

from flask import Blueprint, request, jsonify
from sqlalchemy import func
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from app.dto.trip_stop import (
    TripStopCreate,
    TripStopRead,
    TripStopUpdate,
    TripStopListParams,
    TripStopPage,
)
from models.common import TripStop as TripStopModel
from app.domains.trip_stop.domain import TripStopDomain
from app.dto.auth import PermissionScope
from app.entrypoint.routes.trip_stop import trip_stop_blueprint


@trip_stop_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def create_trip_stop():
    current_user_uuid = get_jwt_identity()
    payload = TripStopCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = TripStopDomain.create_trip_stop(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@trip_stop_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def get_trip_stop(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.trip_stop_repository.find_one(uuid=uuid)
        if m and m.trip and m.trip.is_deleted:
            m = None
        if not m:
            raise NotFoundError("TripStop not found")
        dto = TripStopRead.from_orm(m).model_dump(mode="json")
    return jsonify(dto), 200
#
#
@trip_stop_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def update_trip_stop(uuid: str):
    payload = TripStopUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = TripStopDomain.update_trip_stop(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200

@trip_stop_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def delete_trip_stop(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        TripStopDomain.delete_trip_stop(uow=uow, uuid=uuid)
        uow.commit()
    return jsonify({"message": "Trip stop deleted successfully"}), 204


@trip_stop_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def list_trip_stops():
    params = TripStopListParams(**request.args)
    filters = []
    if params.trip_uuid:
        filters.append(TripStopModel.trip_uuid == params.trip_uuid)
    if params.customer_uuid:
        filters.append(TripStopModel.customer_uuid == params.customer_uuid)
    if params.status:
        filters.append(TripStopModel.status.ilike(f"{params.status}"))
    if params.intersects_area:
        geom_expr = func.ST_GeomFromText(params.intersects_area, 4326)
        filters.append(func.ST_Intersects(TripStopModel.coordinates, geom_expr))

    with SqlAlchemyUnitOfWork() as uow:
        from models.common import Trip as TripModel
        filters.append(TripStopModel.trip.has(TripModel.is_deleted.is_(False)))
        page = uow.trip_stop_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )
        # enrich each stop with the driver assigned to its trip (stop -> trip
        # -> workflow execution -> start_trip operator result), batched
        from models.common import (
            TaskExecution as TaskExecutionModel,
            Task as TaskModel,
            User as UserModel,
        )
        trip_uuids = list({m.trip_uuid for m in page.items if m.trip_uuid})
        trip_to_wfe = dict(
            uow.session.query(TripModel.uuid, TripModel.workflow_execution_uuid)
            .filter(TripModel.uuid.in_(trip_uuids))
            .all()
        ) if trip_uuids else {}
        wfe_uuids = [w for w in trip_to_wfe.values() if w]
        assigned_by_wfe: dict = {}
        if wfe_uuids:
            rows = (
                uow.session.query(
                    TaskExecutionModel.workflow_execution_uuid,
                    TaskExecutionModel.result["assigned_user_uuid"].astext,
                )
                .join(TaskModel, TaskModel.uuid == TaskExecutionModel.task_uuid)
                .filter(
                    TaskExecutionModel.workflow_execution_uuid.in_(wfe_uuids),
                    TaskExecutionModel.account_uuid == uow.account_uuid,
                    TaskModel.operator == "start_trip_operator",
                )
                .all()
            )
            values = {v for _, v in rows if v}
            users = (
                uow.session.query(UserModel.uuid, UserModel.username)
                .filter(
                    UserModel.uuid.in_(values) | UserModel.username.in_(values),
                    UserModel.account_uuid == uow.account_uuid,
                )
                .all()
            ) if values else []
            uuid_to_name = {u[0]: u[1] for u in users}
            usernames = {u[1] for u in users}
            for wfe_uuid, v in rows:
                if v:
                    assigned_by_wfe[wfe_uuid] = uuid_to_name.get(v) or v

        items = []
        for m in page.items:
            dto = TripStopRead.from_orm(m)
            dto.assigned_username = assigned_by_wfe.get(trip_to_wfe.get(m.trip_uuid))
            items.append(dto.model_dump(mode="json"))
        result = TripStopPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200
