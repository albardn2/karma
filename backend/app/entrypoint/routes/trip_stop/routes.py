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
from datetime import timedelta

from app.entrypoint.routes.common.analytics import (
    bucket_arg,
    csv_arg,
    int_arg,
    parse_dt,
)
from app.entrypoint.routes.common.errors import BadRequestError
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

        # orders placed at each stop (non-deleted), batched
        from models.common import CustomerOrder as CustomerOrderModel
        stop_uuids = [m.uuid for m in page.items]
        orders_by_stop: dict = {}
        if stop_uuids:
            for stop_uuid, order_uuid in (
                uow.session.query(
                    CustomerOrderModel.trip_stop_uuid, CustomerOrderModel.uuid
                )
                .filter(
                    CustomerOrderModel.trip_stop_uuid.in_(stop_uuids),
                    CustomerOrderModel.is_deleted.is_(False),
                )
                .all()
            ):
                orders_by_stop.setdefault(stop_uuid, []).append(order_uuid)

        items = []
        for m in page.items:
            dto = TripStopRead.from_orm(m)
            dto.assigned_username = assigned_by_wfe.get(trip_to_wfe.get(m.trip_uuid))
            dto.order_uuids = orders_by_stop.get(m.uuid, [])
            items.append(dto.model_dump(mode="json"))
        result = TripStopPage(
            items=items,
            total_count=page.total,
            page=page.page,
            per_page=page.per_page,
            pages=page.pages,
        ).model_dump(mode="json")
    return jsonify(result), 200


# ----------------------- USER TRIP-STOP ANALYTICS -----------------------
# Sales attributed to the user a trip was ASSIGNED to, via
#   user -> start_trip task execution result -> workflow execution -> trip
#   -> trip stops -> customer orders -> invoices.
#
# Landmines this code deliberately works around (each silently corrupts the
# numbers otherwise):
#  * TaskExecution.operator is a hybrid_property with no SQL expression, so the
#    operator name has to be matched on the joined Task row.
#  * result["assigned_user_uuid"] usually holds a USERNAME, not a uuid.
#  * the assignee lookup is a correlated EXISTS: joining task_execution fans
#    out when a workflow has more than one start_trip execution, doubling sums.
#  * TripStop has NO is_deleted column (deletes are hard); soft-deleted trips
#    are the only exclusion, and they do NOT cascade to their orders.
#  * soft-deleting an invoice does NOT cascade to invoice_item, so revenue is
#    read from the order-level hybrids, which subquery LIVE invoices only.
#  * an order with no invoice reports is_paid == True with a 0 total, so
#    "unpaid" is measured as net_amount_due, never as `not is_paid`.
#  * money is multi-currency; every total is grouped by currency.

_USER_ANALYTICS_SCOPES = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
)


def _assigned_user_exists(uow, user):
    """Correlated EXISTS: this trip's workflow has a start_trip task execution
    assigned to `user` (matched by uuid OR username — the operator form stores
    the username)."""
    from models.common import (
        Trip as TripModel,
        Task as TaskModel,
        TaskExecution as TaskExecutionModel,
    )
    values = [v for v in (user.uuid, user.username) if v]
    return (
        uow.session.query(TaskExecutionModel.uuid)
        .join(TaskModel, TaskModel.uuid == TaskExecutionModel.task_uuid)
        .filter(
            TaskExecutionModel.workflow_execution_uuid
            == TripModel.workflow_execution_uuid,
            TaskExecutionModel.account_uuid == uow.account_uuid,
            TaskModel.operator == "start_trip_operator",
            TaskExecutionModel.result["assigned_user_uuid"].astext.in_(values),
        )
        .exists()
    )


def _user_or_404(uow, user_uuid):
    user = uow.user_repository.find_one(uuid=user_uuid, is_deleted=False)
    if not user:
        raise NotFoundError("User not found")
    return user


def _user_stops_query(uow, user, start, end):
    """Trip stops this user actually VISITED, within the window.

    A 'planned' stop is a future intention and a 'cancelled' one never happened,
    so neither counts towards a user's activity — same rule the customer
    analytics uses for "last visit".
    """
    from app.dto.trip_stop import TripStopStatus
    from models.common import Trip as TripModel
    q = (
        uow.session.query(TripStopModel)
        .join(TripModel, TripModel.uuid == TripStopModel.trip_uuid)
        .filter(
            TripStopModel.account_uuid == uow.account_uuid,
            TripModel.account_uuid == uow.account_uuid,
            TripModel.is_deleted.is_(False),
            TripStopModel.status.notin_(
                [TripStopStatus.PLANNED.value, TripStopStatus.CANCELLED.value]
            ),
            _assigned_user_exists(uow, user),
        )
    )
    if start:
        q = q.filter(TripStopModel.created_at >= start)
    if end:
        q = q.filter(TripStopModel.created_at <= end)
    return q


def _user_orders_query(uow, user, start, end, material_uuids=None):
    """Customer orders placed at this user's trip stops, within the window."""
    from sqlalchemy import select
    from models.common import (
        Trip as TripModel,
        CustomerOrder as CO,
        CustomerOrderItem as COI,
    )
    q = (
        uow.session.query(CO)
        .join(TripStopModel, TripStopModel.uuid == CO.trip_stop_uuid)
        .join(TripModel, TripModel.uuid == TripStopModel.trip_uuid)
        .filter(
            CO.account_uuid == uow.account_uuid,
            CO.is_deleted.is_(False),
            TripModel.account_uuid == uow.account_uuid,
            TripModel.is_deleted.is_(False),
            _assigned_user_exists(uow, user),
        )
    )
    if start:
        q = q.filter(CO.created_at >= start)
    if end:
        q = q.filter(CO.created_at <= end)
    if material_uuids:
        q = q.filter(
            CO.uuid.in_(
                select(COI.customer_order_uuid).where(
                    COI.material_uuid.in_(material_uuids),
                    COI.is_deleted.is_(False),
                    COI.account_uuid == uow.account_uuid,
                )
            )
        )
    return q


def _money_by_currency(orders):
    """Revenue / paid / unpaid per currency for a list of order rows.

    Read off the order-level hybrids (each subqueries LIVE invoices), so a
    voided invoice drops out and an invoice-less order contributes 0 instead of
    counting as "paid".
    """
    revenue, paid, unpaid = {}, {}, {}
    invoiced_orders = 0
    for o in orders:
        currency = o.currency
        if not currency:
            continue  # no live invoice -> no money to attribute
        invoiced_orders += 1
        revenue[currency] = round(
            revenue.get(currency, 0.0) + float(o.total_adjusted_amount or 0), 2
        )
        paid[currency] = round(
            paid.get(currency, 0.0) + float(o.net_amount_paid or 0), 2
        )
        unpaid[currency] = round(
            unpaid.get(currency, 0.0) + float(o.net_amount_due or 0), 2
        )
    return revenue, paid, unpaid, invoiced_orders


def _bucket_key(dt, bucket):
    if bucket == "month":
        return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if bucket == "week":
        base = dt.replace(hour=0, minute=0, second=0, microsecond=0)
        return base - timedelta(days=base.weekday())
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


@trip_stop_blueprint.route("/analytics/user-summary", methods=["GET"])
@jwt_required()
@scopes_required(*_USER_ANALYTICS_SCOPES)
def analytics_user_summary():
    """Totals for one user: stops, orders, revenue/paid/unpaid per currency."""
    user_uuid = request.args.get("user_uuid")
    if not user_uuid:
        raise BadRequestError("user_uuid is required")
    start = parse_dt(request.args.get("start_date"))
    end = parse_dt(request.args.get("end_date"), end_of_day=True)
    material_uuids = csv_arg("material_uuids")

    with SqlAlchemyUnitOfWork() as uow:
        user = _user_or_404(uow, user_uuid)
        stops_q = _user_stops_query(uow, user, start, end)
        stops_total = stops_q.count()
        sold_stops = stops_q.filter(TripStopModel.outcome.ilike("sale%")).count()
        orders = _user_orders_query(uow, user, start, end, material_uuids).all()
        revenue, paid, unpaid, invoiced = _money_by_currency(orders)
        result = {
            "user_uuid": user.uuid,
            "username": user.username,
            "stops": stops_total,
            "stops_with_sale": sold_stops,
            "orders": len(orders),
            "orders_invoiced": invoiced,
            "revenue": revenue,
            "paid": paid,
            "unpaid": unpaid,
        }
    return jsonify(result), 200


@trip_stop_blueprint.route("/analytics/user-sales-over-time", methods=["GET"])
@jwt_required()
@scopes_required(*_USER_ANALYTICS_SCOPES)
def analytics_user_sales_over_time():
    """Revenue per bucket for one user, plus the pre-window baseline so the
    caller can draw a true cumulative curve."""
    from collections import defaultdict
    from models.common import CustomerOrder as CO
    user_uuid = request.args.get("user_uuid")
    if not user_uuid:
        raise BadRequestError("user_uuid is required")
    bucket = bucket_arg()
    start = parse_dt(request.args.get("start_date"))
    end = parse_dt(request.args.get("end_date"), end_of_day=True)
    material_uuids = csv_arg("material_uuids")

    with SqlAlchemyUnitOfWork() as uow:
        user = _user_or_404(uow, user_uuid)
        orders = _user_orders_query(uow, user, start, end, material_uuids).all()
        # bucketed in Python: revenue comes from per-order hybrid subqueries,
        # which can't be GROUP BY'd in SQL without re-deriving all of them
        per_bucket = defaultdict(lambda: {"revenue": {}, "orders": 0})
        for o in orders:
            if not o.created_at:
                continue
            slot = per_bucket[_bucket_key(o.created_at, bucket).isoformat()]
            slot["orders"] += 1
            currency = o.currency
            if currency:
                slot["revenue"][currency] = round(
                    slot["revenue"].get(currency, 0.0)
                    + float(o.total_adjusted_amount or 0),
                    2,
                )
        baseline = {}
        if start:
            before = (
                _user_orders_query(uow, user, None, None, material_uuids)
                .filter(CO.created_at < start)
                .all()
            )
            baseline, _, _, _ = _money_by_currency(before)
        result = {
            "bucket": bucket,
            "baseline": baseline,
            "buckets": [
                {"period": k, "revenue": v["revenue"], "orders": v["orders"]}
                for k, v in sorted(per_bucket.items())
            ],
        }
    return jsonify(result), 200


@trip_stop_blueprint.route("/analytics/user-stops-over-time", methods=["GET"])
@jwt_required()
@scopes_required(*_USER_ANALYTICS_SCOPES)
def analytics_user_stops_over_time():
    """Trip-stop counts per bucket for one user, plus the pre-window baseline."""
    from sqlalchemy import case, func
    user_uuid = request.args.get("user_uuid")
    if not user_uuid:
        raise BadRequestError("user_uuid is required")
    bucket = bucket_arg()
    start = parse_dt(request.args.get("start_date"))
    end = parse_dt(request.args.get("end_date"), end_of_day=True)

    with SqlAlchemyUnitOfWork() as uow:
        user = _user_or_404(uow, user_uuid)
        expr = func.date_trunc(bucket, TripStopModel.created_at)
        rows = (
            _user_stops_query(uow, user, start, end)
            .with_entities(
                expr.label("period"),
                func.count(TripStopModel.uuid).label("count"),
                func.count(
                    case((TripStopModel.outcome.ilike("sale%"), TripStopModel.uuid))
                ).label("sales"),
            )
            .group_by(expr)
            .order_by(expr)
            .all()
        )
        baseline = 0
        if start:
            baseline = (
                _user_stops_query(uow, user, None, None)
                .filter(TripStopModel.created_at < start)
                .count()
            )
        result = {
            "bucket": bucket,
            "baseline": int(baseline or 0),
            "buckets": [
                {
                    "period": period.isoformat(),
                    "count": int(count or 0),
                    "sales": int(sales or 0),
                }
                for period, count, sales in rows
            ],
        }
    return jsonify(result), 200


@trip_stop_blueprint.route("/analytics/user-sales", methods=["GET"])
@jwt_required()
@scopes_required(*_USER_ANALYTICS_SCOPES)
def analytics_user_sales():
    """Paginated table of every customer sale made at this user's trip stops."""
    from math import ceil
    from models.common import Customer as CustomerModel, CustomerOrder as CO
    user_uuid = request.args.get("user_uuid")
    if not user_uuid:
        raise BadRequestError("user_uuid is required")
    start = parse_dt(request.args.get("start_date"))
    end = parse_dt(request.args.get("end_date"), end_of_day=True)
    material_uuids = csv_arg("material_uuids")
    page = int_arg("page", 1, 1)
    per_page = int_arg("per_page", 20, 1, 100)
    sort_dir = request.args.get("sort_dir", "desc")

    with SqlAlchemyUnitOfWork() as uow:
        user = _user_or_404(uow, user_uuid)
        q = _user_orders_query(uow, user, start, end, material_uuids)
        total = q.count()
        q = q.order_by(
            CO.created_at.asc() if sort_dir == "asc" else CO.created_at.desc()
        )
        rows = q.limit(per_page).offset((page - 1) * per_page).all()

        customer_names = {}
        cust_uuids = list({o.customer_uuid for o in rows if o.customer_uuid})
        if cust_uuids:
            customer_names = dict(
                uow.session.query(CustomerModel.uuid, CustomerModel.company_name)
                .filter(
                    CustomerModel.uuid.in_(cust_uuids),
                    CustomerModel.account_uuid == uow.account_uuid,
                )
                .all()
            )
        stop_dates = {}
        stop_uuids = list({o.trip_stop_uuid for o in rows if o.trip_stop_uuid})
        if stop_uuids:
            stop_dates = dict(
                uow.session.query(TripStopModel.uuid, TripStopModel.created_at)
                .filter(
                    TripStopModel.uuid.in_(stop_uuids),
                    TripStopModel.account_uuid == uow.account_uuid,
                )
                .all()
            )

        items = []
        for o in rows:
            currency = o.currency
            stop_date = stop_dates.get(o.trip_stop_uuid)
            items.append(
                {
                    "uuid": o.uuid,
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                    "customer_uuid": o.customer_uuid,
                    "customer_name": customer_names.get(o.customer_uuid),
                    "trip_stop_uuid": o.trip_stop_uuid,
                    "trip_stop_date": stop_date.isoformat() if stop_date else None,
                    "currency": currency,
                    "total": round(float(o.total_adjusted_amount or 0), 2),
                    "paid": round(float(o.net_amount_paid or 0), 2),
                    "unpaid": round(float(o.net_amount_due or 0), 2),
                    # meaningless without a live invoice, so report null there
                    "is_paid": bool(o.is_paid) if currency else None,
                    "is_fulfilled": bool(o.is_fulfilled),
                }
            )
        result = {
            "items": items,
            "total_count": total,
            "page": page,
            "per_page": per_page,
            "pages": ceil(total / per_page) if total else 0,
        }
    return jsonify(result), 200
