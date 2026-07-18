from collections import defaultdict
from datetime import datetime, timedelta

from flask import request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import PermissionScope
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.dashboard import dashboard_blueprint
from models.common import (
    Customer as CustomerModel,
    CustomerOrder as CustomerOrderModel,
    Invoice as InvoiceModel,
    Payment as PaymentModel,
    Trip as TripModel,
)


def _day(dt) -> str:
    return dt.strftime("%Y-%m-%d") if dt else ""


def _series(days: list[str], by_day: dict) -> list[dict]:
    return [{"t": d, "v": by_day.get(d, 0)} for d in days]


@dashboard_blueprint.route("/overview", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def overview():
    """Landing-page analytics over a configurable window: money totals and
    per-day series per currency, plus new customers / orders / trips counts."""
    try:
        days_window = max(1, min(365, int(request.args.get("days", 30))))
    except ValueError:
        days_window = 30

    now = datetime.utcnow()
    start = (now - timedelta(days=days_window - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    day_keys = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days_window)]

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session

        # ---- money metrics from orders created in the window ----
        # totals/series keyed by currency; amount_due needs the hybrid props,
        # so iterate the window's orders (dashboard windows are bounded)
        revenue_total: dict = defaultdict(float)
        debt_total: dict = defaultdict(float)
        revenue_by_day: dict = defaultdict(lambda: defaultdict(float))
        orders_by_day: dict = defaultdict(int)
        orders_count = 0
        window_orders = (
            s.query(CustomerOrderModel)
            .filter(
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.created_at >= start,
            )
            .all()
        )
        for o in window_orders:
            cur = o.currency or "?"
            day = _day(o.created_at)
            total = o.total_adjusted_amount or 0
            revenue_total[cur] += total
            revenue_by_day[cur][day] += total
            debt_total[cur] += o.net_amount_due or 0
            orders_by_day[day] += 1
            orders_count += 1

        # ---- collected: payments in the window (skip deleted/voided chains) ----
        collected_total: dict = defaultdict(float)
        collected_by_day: dict = defaultdict(lambda: defaultdict(float))
        payments = (
            s.query(PaymentModel)
            .outerjoin(InvoiceModel, PaymentModel.invoice_uuid == InvoiceModel.uuid)
            .filter(
                PaymentModel.is_deleted.is_(False),
                PaymentModel.created_at >= start,
                (InvoiceModel.uuid.is_(None)) | (InvoiceModel.is_deleted.is_(False)),
            )
            .all()
        )
        for p in payments:
            cur = p.currency or "?"
            day = _day(p.created_at)
            collected_total[cur] += p.amount or 0
            collected_by_day[cur][day] += p.amount or 0

        # ---- counts: new customers + trips per day ----
        new_customers_rows = (
            s.query(func.date(CustomerModel.created_at), func.count())
            .filter(
                CustomerModel.is_deleted.is_(False),
                CustomerModel.created_at >= start,
            )
            .group_by(func.date(CustomerModel.created_at))
            .all()
        )
        customers_by_day = {str(d): c for d, c in new_customers_rows}

        trips_rows = (
            s.query(func.date(TripModel.created_at), func.count())
            .filter(TripModel.is_deleted.is_(False), TripModel.created_at >= start)
            .group_by(func.date(TripModel.created_at))
            .all()
        )
        trips_by_day = {str(d): c for d, c in trips_rows}

        def _nonzero(cur: str) -> bool:
            return bool(
                revenue_total.get(cur) or collected_total.get(cur) or debt_total.get(cur)
            )

        currencies = sorted(
            c for c in (set(revenue_total) | set(collected_total) | set(debt_total)) if _nonzero(c)
        )

        result = {
            "from": start.isoformat(),
            "to": now.isoformat(),
            "days": days_window,
            "currencies": currencies,
            "totals": {
                "revenue": dict(revenue_total),
                "collected": dict(collected_total),
                "window_debt": {k: round(v, 2) for k, v in debt_total.items()},
                "new_customers": sum(customers_by_day.values()),
                "orders": orders_count,
                "trips": sum(trips_by_day.values()),
            },
            "series": {
                "revenue": {
                    cur: _series(day_keys, by_day) for cur, by_day in revenue_by_day.items()
                },
                "collected": {
                    cur: _series(day_keys, by_day) for cur, by_day in collected_by_day.items()
                },
                "new_customers": _series(day_keys, customers_by_day),
                "orders": _series(day_keys, orders_by_day),
                "trips": _series(day_keys, trips_by_day),
            },
        }
    return jsonify(result), 200
