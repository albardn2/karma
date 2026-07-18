# app/entrypoint/routes/trip/routes.py
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.trip import (
    TripCreate,
    TripRead,
    TripUpdate,
    TripListParams,
    TripPage,
)
from models.common import Trip as TripModel
from app.domains.trip.domain import TripDomain

from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required, add_logged_user_to_payload
from flask_jwt_extended import get_jwt_identity, jwt_required
from app.entrypoint.routes.trip import trip_blueprint


@trip_blueprint.route("/", methods=["POST"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def create_trip():
    current_user_uuid = get_jwt_identity()
    payload = TripCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_user_uuid, payload=payload)
        dto = TripDomain.create_trip(uow=uow, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 201


@trip_blueprint.route("/<string:uuid>", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def get_trip(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        m = uow.trip_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("Trip not found")
        dto = TripRead.from_orm(m)
        dto.assigned_username = _assigned_username_for_wfe(uow, m.workflow_execution_uuid)
        dto = dto.model_dump(mode="json")
    return jsonify(dto), 200


def _assigned_username_for_wfe(uow, wfe_uuid):
    """Resolve a workflow execution's assignee (stored on the start_trip task
    result as username-or-uuid) to a username; None when unassigned."""
    if not wfe_uuid:
        return None
    from models.common import (
        TaskExecution as TaskExecutionModel,
        Task as TaskModel,
        User as UserModel,
    )
    row = (
        uow.session.query(TaskExecutionModel.result["assigned_user_uuid"].astext)
        .join(TaskModel, TaskModel.uuid == TaskExecutionModel.task_uuid)
        .filter(
            TaskExecutionModel.workflow_execution_uuid == wfe_uuid,
            TaskExecutionModel.account_uuid == uow.account_uuid,
            TaskModel.operator == "start_trip_operator",
        )
        .first()
    )
    v = row[0] if row else None
    if not v:
        return None
    u = (
        uow.session.query(UserModel.username)
        .filter(
            (UserModel.uuid == v) | (UserModel.username == v),
            UserModel.account_uuid == uow.account_uuid,
        )
        .first()
    )
    return u[0] if u else v
#
#
@trip_blueprint.route("/<string:uuid>/activity", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def get_trip_activity(uuid: str):
    """Stops, orders, fulfillments (vehicle sales) and payments at this trip's stops."""
    from app.utils.geom_utils import wkt_or_wkb_to_lat_lon

    with SqlAlchemyUnitOfWork() as uow:
        trip = uow.trip_repository.find_one(uuid=uuid, is_deleted=False)
        if not trip:
            raise NotFoundError("Trip not found")

        def customer_name(customer):
            if not customer:
                return None
            return customer.company_name or customer.full_name

        material_names: dict = {}
        def material_name(material_uuid):
            if material_uuid not in material_names:
                mat = uow.material_repository.find_one(uuid=material_uuid)
                material_names[material_uuid] = mat.name if mat else material_uuid
            return material_names[material_uuid]

        stops = []
        for stop in trip.stops:
            task_exe = (
                uow.task_execution_repository.find_one(uuid=stop.task_execution_uuid)
                if stop.task_execution_uuid else None
            )
            try:
                latlon = wkt_or_wkb_to_lat_lon(stop.coordinates)
            except Exception:
                latlon = None
            stops.append({
                "uuid": stop.uuid,
                "index": stop.index,
                "customer_uuid": stop.customer_uuid,
                "customer_name": customer_name(stop.customer),
                "status": task_exe.status if task_exe else stop.status,
                "outcome": stop.outcome,
                "coordinates": latlon,  # "lat,lon"
                "created_at": stop.created_at.isoformat() if stop.created_at else None,
                "completed_at": task_exe.end_time.isoformat() if task_exe and task_exe.end_time else None,
            })
        stops.sort(key=lambda s: (s["index"] is None, s["index"], s["created_at"] or ""))

        orders, fulfillments, payments = [], [], []
        for stop in trip.stops:
            for o in stop.customer_orders:
                if o.is_deleted:
                    continue
                items = []
                for item in o.customer_order_items:
                    if item.is_deleted:
                        continue
                    price = item.invoice_item.price_per_unit if item.invoice_item else None
                    items.append({
                        "material_name": material_name(item.material_uuid),
                        "quantity": item.quantity,
                        "price_per_unit": price,
                        "amount": (item.quantity or 0) * price if price is not None else None,
                    })
                orders.append({
                    "uuid": o.uuid,
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                    "customer_name": customer_name(o.customer),
                    "total": o.total_adjusted_amount,
                    "amount_due": o.net_amount_due,
                    "amount_paid": o.net_amount_paid,
                    "currency": o.currency,
                    "is_paid": o.is_paid,
                    "is_fulfilled": o.is_fulfilled,
                    "items": items,
                })
            for ev in stop.vehicle_inventory_events:
                if ev.is_deleted or ev.event_type != "sale":
                    continue
                item = ev.customer_order_item
                order = item.customer_order if item else None
                # legacy voids: the order was deleted without cascading — its
                # leftover sale events must not count as trip activity
                if (item and item.is_deleted) or (order and order.is_deleted):
                    continue
                fulfillments.append({
                    "created_at": ev.created_at.isoformat() if ev.created_at else None,
                    "material_name": material_name(ev.material_uuid),
                    "quantity": -ev.quantity,  # stored as negative delta; report as positive
                    "customer_name": customer_name(order.customer) if order else None,
                    "customer_order_uuid": order.uuid if order else None,
                })
            for p in stop.payments:
                if p.is_deleted:
                    continue
                inv = p.invoice
                order = inv.customer_order if inv else None
                if (inv and inv.is_deleted) or (order and order.is_deleted):
                    continue
                payments.append({
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "amount": p.amount,
                    "currency": p.currency,
                    "customer_name": customer_name(order.customer) if order else None,
                    "customer_order_uuid": order.uuid if order else None,
                })

        newest_first = lambda rows: sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)
        result = {
            "stops": stops,
            "orders": newest_first(orders),
            "fulfillments": newest_first(fulfillments),
            "payments": newest_first(payments),
        }
    return jsonify(result), 200
#
#
@trip_blueprint.route("/<string:uuid>", methods=["PUT"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def update_trip(uuid: str):
    payload = TripUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        dto = TripDomain.update_trip(uow=uow, uuid=uuid, payload=payload)
        uow.commit()
    return jsonify(dto.model_dump(mode="json")), 200


@trip_blueprint.route("/", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATOR.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.DRIVER.value,
    PermissionScope.SALES.value,
)
def list_trips():
    params = TripListParams(**request.args)
    filters = []
    if params.uuid:
        filters.append(TripModel.uuid == params.uuid)
    if params.created_by_uuid:
        filters.append(TripModel.created_by_uuid == params.created_by_uuid)
    if params.vehicle_uuid:
        filters.append(TripModel.vehicle_uuid == params.vehicle_uuid)
    if params.service_area_uuid:
        filters.append(TripModel.service_area_uuid == params.service_area_uuid)
    if params.workflow_execution_uuid:
        filters.append(TripModel.workflow_execution_uuid == params.workflow_execution_uuid)
    if params.status:
        filters.append(TripModel.status.ilike(f"%{params.status}%"))
    if params.intersects_area:
        geom_expr = func.ST_GeomFromText(params.intersects_area, 4326)
        filters.append(func.ST_Intersects(TripModel.geometry, geom_expr))

    filters.append(TripModel.is_deleted.is_(False))

    with SqlAlchemyUnitOfWork() as uow:
        page = uow.trip_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
        )

        # batch-resolve each trip's assignee (start_trip result, stored as
        # username or uuid) — two queries for the whole page, no N+1
        from models.common import (
            TaskExecution as TaskExecutionModel,
            Task as TaskModel,
            User as UserModel,
        )
        wfe_uuids = [t.workflow_execution_uuid for t in page.items if t.workflow_execution_uuid]
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
                if not v:
                    continue
                assigned_by_wfe[wfe_uuid] = uuid_to_name.get(v) or (v if v in usernames else v)

        items = []
        for m in page.items:
            dto = TripRead.from_orm(m)
            dto.assigned_username = assigned_by_wfe.get(m.workflow_execution_uuid)
            items.append(dto.model_dump(mode="json"))
        result = TripPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200


@trip_blueprint.route("/<string:uuid>", methods=["DELETE"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
)
def delete_trip(uuid: str):
    """Soft-delete a trip (admins only). An active trip is cancelled first
    (stops + task executions included) so the deleted trip is inert, not just
    hidden. The paired workflow execution is soft-deleted with it — unless it
    still has other live trips."""
    from app.domains.workflow_execution.domain import WorkflowExecutionDomain
    from app.dto.trip import TripStatus
    from app.dto.workflow_execution import WorkflowStatus

    with SqlAlchemyUnitOfWork() as uow:
        trip = uow.trip_repository.find_one(uuid=uuid, is_deleted=False)
        if not trip:
            raise NotFoundError("Trip not found")

        wfe = (
            uow.workflow_execution_repository.find_one(uuid=trip.workflow_execution_uuid)
            if trip.workflow_execution_uuid else None
        )
        # cancel anything still running so nothing keeps writing to a deleted trip
        if wfe and wfe.status not in (
            WorkflowStatus.COMPLETED.value, WorkflowStatus.CANCELLED.value, WorkflowStatus.FAILED.value
        ):
            WorkflowExecutionDomain.cancel_workflow_execution(uow=uow, uuid=wfe.uuid)
        if trip.status not in (TripStatus.COMPLETED.value, TripStatus.CANCELLED.value):
            TripDomain.cancel_trip(uow=uow, uuid=trip.uuid)

        trip.is_deleted = True
        uow.trip_repository.save(model=trip, commit=False)
        if wfe:
            live_siblings = [
                t for t in (wfe.trips or []) if t.uuid != trip.uuid and not t.is_deleted
            ]
            if not live_siblings:
                wfe.is_deleted = True
                uow.workflow_execution_repository.save(model=wfe, commit=False)
        uow.commit()
    return jsonify({"uuid": uuid, "is_deleted": True}), 200
