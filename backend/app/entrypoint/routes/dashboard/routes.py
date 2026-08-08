from collections import defaultdict
from datetime import datetime, timedelta

from flask import request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.exchange_rate.converter import CurrencyConverter
from app.dto.auth import PermissionScope
from app.dto.common_enums import Currency
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.dashboard import dashboard_blueprint
from models.common import (
    Customer as CustomerModel,
    CustomerOrder as CustomerOrderModel,
    Invoice as InvoiceModel,
    Payment as PaymentModel,
    Trip as TripModel,
)

# When the caller names no reporting currency, USD is the reference unit: it is
# stable against SYP volatility and the redenomination, so a converted total is
# comparable across the whole window. A tenant can still ask for SYP explicitly.
DEFAULT_TARGET_CURRENCY = Currency.USD


def _target_currency() -> Currency:
    raw = (request.args.get("target_currency") or "").strip().upper()
    try:
        return Currency(raw) if raw else DEFAULT_TARGET_CURRENCY
    except ValueError:
        # an unknown target is a client mistake, not a reason to 500 a landing
        # page; fall back to the default rather than reject
        return DEFAULT_TARGET_CURRENCY


@dashboard_blueprint.route("/catalog", methods=["GET"])
@jwt_required()
def catalog():
    """The pre-defined set of dashboards, declared once server-side.

    The single source of truth that the super-admin assignment matrix, both
    clients' labels/ordering, and the assignment validator all read, so a new
    dashboard is declared in exactly one place. Open to any authenticated user:
    it is a static menu of ids and label keys, not data.
    """
    from app.entrypoint.routes.common.permissions import DASHBOARD_CATALOG

    return jsonify(DASHBOARD_CATALOG), 200


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

    target = _target_currency()

    now = datetime.utcnow()
    start = (now - timedelta(days=days_window - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    day_keys = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days_window)]

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session

        # One converter per request: it caches each day's rate and pulls at most
        # once, so restating a whole window of orders costs one rate lookup per
        # distinct day. Every amount is converted at ITS OWN day's rate before it
        # is summed — the only honest way to combine SYP and USD into one number.
        conv = CurrencyConverter(uow, target)

        # An amount that cannot be converted (a currency with no rate anywhere)
        # is never zeroed into the total; it is counted here and reported raw, so
        # a converted headline can always say "plus N records not converted".
        # With USD<->SYP the only pair and a full year of rates, this stays empty
        # in practice, but the contract must be able to admit a gap.
        unconv_count: dict = defaultdict(int)
        unconv_raw: dict = defaultdict(float)

        def _add(bucket_total, bucket_by_day, cur, day, amount, when):
            """Sum the raw per-currency figure AND the converted one, or bank the
            unconvertible amount for honest disclosure."""
            bucket_total[cur] += amount
            bucket_by_day[cur][day] += amount
            c = conv.convert(amount, cur if cur != "?" else None, when)
            if c is None:
                if amount:
                    unconv_count[cur] += 1
                    unconv_raw[cur] += amount
                return None
            return c

        # ---- money metrics from orders created in the window ----
        # per-currency maps kept as-is (existing consumers read them); converted
        # totals/series added alongside. amount_due needs the hybrid props, so
        # iterate the window's orders (dashboard windows are bounded).
        revenue_total: dict = defaultdict(float)
        debt_total: dict = defaultdict(float)
        revenue_by_day: dict = defaultdict(lambda: defaultdict(float))
        orders_by_day: dict = defaultdict(int)
        revenue_conv_total = 0.0
        debt_conv_total = 0.0
        revenue_conv_by_day: dict = defaultdict(float)
        orders_count = 0
        window_orders = (
            s.query(CustomerOrderModel)
            .filter(
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.created_at >= start,
                CustomerOrderModel.account_uuid == uow.account_uuid,
            )
            .all()
        )
        for o in window_orders:
            cur = o.currency or "?"
            day = _day(o.created_at)
            total = o.total_adjusted_amount or 0
            rc = _add(revenue_total, revenue_by_day, cur, day, total, o.created_at)
            if rc is not None:
                revenue_conv_total += rc
                revenue_conv_by_day[day] += rc
            due = o.net_amount_due or 0
            debt_total[cur] += due
            dc = conv.convert(due, cur if cur != "?" else None, o.created_at)
            if dc is not None:
                debt_conv_total += dc
            elif due:
                unconv_count[cur] += 1
                unconv_raw[cur] += due
            orders_by_day[day] += 1
            orders_count += 1

        # ---- collected: payments in the window (skip deleted/voided chains) ----
        collected_total: dict = defaultdict(float)
        collected_by_day: dict = defaultdict(lambda: defaultdict(float))
        collected_conv_total = 0.0
        collected_conv_by_day: dict = defaultdict(float)
        payments = (
            s.query(PaymentModel)
            .outerjoin(InvoiceModel, PaymentModel.invoice_uuid == InvoiceModel.uuid)
            .filter(
                PaymentModel.is_deleted.is_(False),
                PaymentModel.created_at >= start,
                PaymentModel.account_uuid == uow.account_uuid,
                (InvoiceModel.uuid.is_(None)) | (InvoiceModel.is_deleted.is_(False)),
            )
            .all()
        )
        for p in payments:
            cur = p.currency or "?"
            day = _day(p.created_at)
            amount = p.amount or 0
            cc = _add(collected_total, collected_by_day, cur, day, amount, p.created_at)
            if cc is not None:
                collected_conv_total += cc
                collected_conv_by_day[day] += cc

        # ---- counts: new customers + trips per day ----
        new_customers_rows = (
            s.query(func.date(CustomerModel.created_at), func.count())
            .filter(
                CustomerModel.is_deleted.is_(False),
                CustomerModel.created_at >= start,
                CustomerModel.account_uuid == uow.account_uuid,
            )
            .group_by(func.date(CustomerModel.created_at))
            .all()
        )
        customers_by_day = {str(d): c for d, c in new_customers_rows}

        trips_rows = (
            s.query(func.date(TripModel.created_at), func.count())
            .filter(
                TripModel.is_deleted.is_(False),
                TripModel.created_at >= start,
                TripModel.account_uuid == uow.account_uuid,
            )
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
            # what the converted figures below are denominated in, echoed back so
            # a client that fell back to the default knows which currency it got
            "target_currency": target.value,
            "totals": {
                "revenue": dict(revenue_total),
                "collected": dict(collected_total),
                "window_debt": {k: round(v, 2) for k, v in debt_total.items()},
                "new_customers": sum(customers_by_day.values()),
                "orders": orders_count,
                "trips": sum(trips_by_day.values()),
            },
            # single-currency figures: every amount restated at its own day's
            # rate and summed. These are what the revamped dashboards read; the
            # per-currency maps above stay for the existing consumers.
            "totals_converted": {
                "revenue": round(revenue_conv_total, 2),
                "collected": round(collected_conv_total, 2),
                "window_debt": round(debt_conv_total, 2),
            },
            # non-empty only when some amount had no rate to convert by; never
            # folded into the totals above
            "unconverted": {
                "count": sum(unconv_count.values()),
                "by_currency": {k: round(v, 2) for k, v in unconv_raw.items()},
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
            "series_converted": {
                "revenue": _series(day_keys, revenue_conv_by_day),
                "collected": _series(day_keys, collected_conv_by_day),
            },
        }
    return jsonify(result), 200
