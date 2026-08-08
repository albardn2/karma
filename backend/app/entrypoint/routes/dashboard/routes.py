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
    Expense as ExpenseModel,
    Invoice as InvoiceModel,
    InventoryEvent as InventoryEventModel,
    Payment as PaymentModel,
    Payout as PayoutModel,
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


# ---------------------------------------------------------------------------
# Profitability — a grouped three-bar chart per period:
#   revenue | gross (revenue − COGS) | net (gross − expenses − salaries)
# converted to one reporting currency, over year / quarter / month buckets.
# ---------------------------------------------------------------------------

# Group caps per granularity — a phone bar chart of three-bars-times-N gets
# unreadable fast (36 bars at ~7pt). Matches the screenshot's ~3-group density.
_PERIOD_CAPS = {"year": 5, "quarter": 8, "month": 6}


def _period_key(dt, gran: str) -> str:
    if gran == "year":
        return dt.strftime("%Y")
    if gran == "quarter":
        return f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"
    if gran == "week":
        # ISO year-week, so the label of any day matches the label of its week's
        # Monday (which is what the bucket starts are keyed by)
        iso = dt.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if gran == "day":
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m")


def _period_start(dt, gran: str):
    d = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if gran == "year":
        return d.replace(month=1, day=1)
    if gran == "quarter":
        return d.replace(month=((d.month - 1) // 3) * 3 + 1, day=1)
    if gran == "week":
        # Monday of dt's week — weekday() is 0 for Monday
        return d - timedelta(days=d.weekday())
    if gran == "day":
        return d
    return d.replace(day=1)


def _step_back(dt, gran: str, n: int):
    """The period-start `n` periods before the one containing dt."""
    start = _period_start(dt, gran)
    if gran == "year":
        return start.replace(year=start.year - n)
    if gran == "week":
        return start - timedelta(weeks=n)
    if gran == "day":
        return start - timedelta(days=n)
    months = n * (3 if gran == "quarter" else 1)
    y = start.year + (start.month - 1 - months) // 12
    m = (start.month - 1 - months) % 12 + 1
    return start.replace(year=y, month=m)


@dashboard_blueprint.route("/profitability", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def profitability():
    """Revenue, gross profit and net profit per period, in one currency.

      revenue = Σ customer-order total_adjusted_amount (by order created_at)
      gross   = revenue − COGS
      net     = gross − expenses − salaries

    COGS is not stored: it is the cost basis of the stock each sale consumed,
    summed over 'sale' inventory events at their lot's weighted-average cost
    (reusing the inventory costing engine). A sale drawn from a lot whose cost is
    unknown is NOT counted as free — its quantity goes to an `uncosted` bucket and
    gross/net are reported as excluding it, never quietly overstated.

    Salaries have no first-class home in this schema; the only path is a payout
    made to an employee (payout.employee_uuid). Until such payouts exist the term
    is 0 and `salaries_backed` is false, so a client can say "before salaries"
    rather than imply a real subtraction.

    Every figure is converted to the target currency at its own date and summed —
    the same convert-then-sum rule as the overview, never a cross-currency mix.
    """
    from app.domains.inventory.domain import InventoryDomain

    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _PERIOD_CAPS:
        gran = "month"
    cap = _PERIOD_CAPS[gran]
    try:
        periods = max(1, min(cap, int(request.args.get("periods", cap))))
    except ValueError:
        periods = cap
    target = _target_currency()

    now = datetime.utcnow()
    # the period-start of each of the last `periods` buckets, oldest first, so the
    # client draws left to right. start is the oldest bucket's start.
    period_starts = [_step_back(now, gran, periods - 1 - i) for i in range(periods)]
    start = period_starts[0]
    key_order = [_period_key(ps, gran) for ps in period_starts]
    starts = {_period_key(ps, gran): ps for ps in period_starts}

    revenue: dict = defaultdict(float)
    cogs: dict = defaultdict(float)
    expenses: dict = defaultdict(float)
    salaries: dict = defaultdict(float)
    uncosted_qty = 0.0
    unconv_amt = 0.0
    unconv_count = 0
    salaries_backed = False

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session
        conv = CurrencyConverter(uow, target)
        # one cost context for every lot this request touches: caches each lot's
        # cost and each rate day once, and holds the single backfill latch
        cost_ctx = InventoryDomain.new_cost_context(currency=target)

        def bucket(dt):
            k = _period_key(dt, gran)
            return k if k in starts else None

        # ---- revenue: order total at order created_at ----
        for o in (
            s.query(CustomerOrderModel)
            .filter(
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.created_at >= start,
                CustomerOrderModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(o.created_at)
            if not k:
                continue
            amt = o.total_adjusted_amount or 0
            c = conv.convert(amt, o.currency, o.created_at)
            if c is None:
                if amt:
                    unconv_amt += amt
                    unconv_count += 1
                continue
            revenue[k] += c

        # ---- COGS: cost basis of stock consumed by 'sale' events ----
        for e in (
            s.query(InventoryEventModel)
            .filter(
                InventoryEventModel.is_deleted.is_(False),
                InventoryEventModel.event_type == "sale",
                InventoryEventModel.created_at >= start,
                InventoryEventModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(e.created_at)
            if not k:
                continue
            qty = abs(e.quantity or 0)
            if not qty:
                continue
            # lot cost already in target currency (converted at receipt date
            # inside the costing engine); None = unknowable, so bank the quantity
            lot_cost, _orig = InventoryDomain._lot_cost_and_quantity(
                uow=uow, inventory_uuid=e.inventory_uuid, ctx=cost_ctx
            )
            if lot_cost is None:
                uncosted_qty += qty
                continue
            cogs[k] += qty * lot_cost

        # ---- expenses: Expense.amount at created_at ----
        for x in (
            s.query(ExpenseModel)
            .filter(
                ExpenseModel.is_deleted.is_(False),
                ExpenseModel.created_at >= start,
                ExpenseModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(x.created_at)
            if not k:
                continue
            c = conv.convert(x.amount or 0, x.currency, x.created_at)
            if c is None:
                if x.amount:
                    unconv_amt += x.amount or 0
                    unconv_count += 1
                continue
            expenses[k] += c

        # ---- salaries: payouts made to an employee ----
        for p in (
            s.query(PayoutModel)
            .filter(
                PayoutModel.is_deleted.is_(False),
                PayoutModel.employee_uuid.isnot(None),
                PayoutModel.created_at >= start,
                PayoutModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(p.created_at)
            if not k:
                continue
            salaries_backed = True
            c = conv.convert(p.amount or 0, p.currency, p.created_at)
            if c is None:
                if p.amount:
                    unconv_amt += p.amount or 0
                    unconv_count += 1
                continue
            salaries[k] += c

    groups = []
    for k in key_order:
        rev = round(revenue[k], 2)
        gross = round(revenue[k] - cogs[k], 2)
        net = round(revenue[k] - cogs[k] - expenses[k] - salaries[k], 2)
        groups.append(
            {
                "period_label": k,
                "period_start": starts[k].strftime("%Y-%m-%d"),
                "revenue": rev,
                "gross": gross,
                "net": net,
            }
        )

    return jsonify(
        {
            "target_currency": target.value,
            "granularity": gran,
            "groups": groups,
            "disclosure": {
                # sold units whose lot cost is unknown — gross/net exclude these
                "uncosted_quantity": round(uncosted_qty, 2),
                # money that had no rate to convert (never folded into a figure)
                "unconverted_amount": round(unconv_amt, 2),
                "unconverted_count": unconv_count,
                # false until at least one employee payout exists in the window;
                # lets the client label net as "before salaries (not tracked)"
                "salaries_backed": salaries_backed,
            },
        }
    ), 200


# ---------------------------------------------------------------------------
# Revenue over time — one dataset, two views the client toggles between:
#   * per period: revenue split into received + debt (a stacked bar)
#   * cumulative: running revenue and running debt (two curves)
# over week / month / quarter / year buckets, in one reporting currency.
# ---------------------------------------------------------------------------

# A single bar per period stacks more densely than profitability's three, and a
# cumulative line wants more points, so these run longer than _PERIOD_CAPS. Week is
# offered here (profitability has no weekly view) for the finer revenue trend.
_REVENUE_CAPS = {"year": 6, "quarter": 8, "month": 12, "week": 12}


@dashboard_blueprint.route("/revenue-over-time", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def revenue_over_time():
    """Revenue over time, per period and cumulative, in one currency.

      revenue  = Σ customer-order total_adjusted_amount (by order created_at)
      debt     = Σ customer-order net_amount_due (current outstanding)
      received = revenue − debt   (the portion already paid down)

    `received` is the paid-down portion of each period's OWN orders, not payments
    banked in the period — that is deliberately what makes received + debt equal
    that period's revenue exactly, so the two segments of a stacked bar always add
    up to the bar. (Cash collected in a period is a different question, answered by
    the overview's `collected`.) The cumulative curves are the running sums of the
    per-period revenue and debt across the shown window, from zero at its start.

    Every amount is converted to the target currency at its own order date and then
    summed — the same convert-then-sum rule as the rest of the dashboards, never a
    cross-currency mix. total and its due convert at the same day's rate, so the
    split stays exact in the reporting currency too.
    """
    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _REVENUE_CAPS:
        gran = "month"
    cap = _REVENUE_CAPS[gran]
    try:
        periods = max(1, min(cap, int(request.args.get("periods", cap))))
    except ValueError:
        periods = cap
    target = _target_currency()

    now = datetime.utcnow()
    period_starts = [_step_back(now, gran, periods - 1 - i) for i in range(periods)]
    start = period_starts[0]
    key_order = [_period_key(ps, gran) for ps in period_starts]
    starts = {_period_key(ps, gran): ps for ps in period_starts}

    revenue: dict = defaultdict(float)
    debt: dict = defaultdict(float)
    unconv_amt = 0.0
    unconv_count = 0

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session
        conv = CurrencyConverter(uow, target)

        def bucket(dt):
            k = _period_key(dt, gran)
            return k if k in starts else None

        for o in (
            s.query(CustomerOrderModel)
            .filter(
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.created_at >= start,
                CustomerOrderModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(o.created_at)
            if not k:
                continue
            total = o.total_adjusted_amount or 0
            due = o.net_amount_due or 0
            rc = conv.convert(total, o.currency, o.created_at)
            if rc is None:
                # no rate for this order's day — bank it for disclosure rather
                # than count a partial (converting only the due side would break
                # received + debt = revenue)
                if total:
                    unconv_amt += total
                    unconv_count += 1
                continue
            # same currency and day as total, so this resolves whenever rc did
            dc = conv.convert(due, o.currency, o.created_at) or 0.0
            revenue[k] += rc
            debt[k] += dc

    groups = []
    cum_rev = 0.0
    cum_debt = 0.0
    for k in key_order:
        rev = revenue[k]
        d = debt[k]
        cum_rev += rev
        cum_debt += d
        groups.append(
            {
                "period_label": k,
                "period_start": starts[k].strftime("%Y-%m-%d"),
                "revenue": round(rev, 2),
                # received + debt == revenue (before rounding); the client can
                # stack them without a residual
                "received": round(rev - d, 2),
                "debt": round(d, 2),
                "cumulative_revenue": round(cum_rev, 2),
                "cumulative_debt": round(cum_debt, 2),
            }
        )

    return jsonify(
        {
            "target_currency": target.value,
            "granularity": gran,
            "groups": groups,
            "disclosure": {
                "unconverted_amount": round(unconv_amt, 2),
                "unconverted_count": unconv_count,
            },
        }
    ), 200


# ---------------------------------------------------------------------------
# Expenses & salaries — a stacked bar per period, one segment per expense
# category plus a salaries segment, over week / month / quarter / year, in one
# reporting currency.
# ---------------------------------------------------------------------------

# The distinct thing here: salaries are NOT an expense category (the enum has no
# such value) — they are payouts made to an employee, the same definition
# profitability uses, kept separate so the two clients agree on what "salaries"
# means. Its key is a reserved segment id that cannot collide with a category.
_SALARIES_KEY = "salaries"


@dashboard_blueprint.route("/expenses-breakdown", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def expenses_breakdown():
    """Spend per period, broken down into a colour-coded stack.

    Each period's bar is the sum of its expense categories (Expense.category) plus a
    salaries segment (payouts made to an employee — Payout.employee_uuid, the same
    source profitability uses; salaries are deliberately not one of the expense
    categories, since the schema has no salary category). Every amount is converted
    to the target currency at its own date and summed — the same convert-then-sum
    rule as the rest of the dashboards.

    `categories` is the ordered list of segment keys that actually have spend in the
    window (salaries first, then expense categories in their enum order), so the
    client stacks and colours them consistently and never draws an empty segment.
    """
    from app.dto.expense import ExpenseCategory

    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _REVENUE_CAPS:
        gran = "month"
    cap = _REVENUE_CAPS[gran]
    try:
        periods = max(1, min(cap, int(request.args.get("periods", cap))))
    except ValueError:
        periods = cap
    target = _target_currency()

    now = datetime.utcnow()
    period_starts = [_step_back(now, gran, periods - 1 - i) for i in range(periods)]
    start = period_starts[0]
    key_order = [_period_key(ps, gran) for ps in period_starts]
    starts = {_period_key(ps, gran): ps for ps in period_starts}

    # per period -> per segment total, converted
    by_period: dict = defaultdict(lambda: defaultdict(float))
    seg_totals: dict = defaultdict(float)
    unconv_amt = 0.0
    unconv_count = 0
    salaries_backed = False

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session
        conv = CurrencyConverter(uow, target)

        def bucket(dt):
            k = _period_key(dt, gran)
            return k if k in starts else None

        # ---- expenses, one segment per category ----
        for x in (
            s.query(ExpenseModel)
            .filter(
                ExpenseModel.is_deleted.is_(False),
                ExpenseModel.created_at >= start,
                ExpenseModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(x.created_at)
            if not k:
                continue
            seg = (x.category or "other")
            # a stored value outside the enum still gets a segment rather than
            # vanishing — it sorts after the known ones below
            c = conv.convert(x.amount or 0, x.currency, x.created_at)
            if c is None:
                if x.amount:
                    unconv_amt += x.amount or 0
                    unconv_count += 1
                continue
            by_period[k][seg] += c
            seg_totals[seg] += c

        # ---- salaries: payouts made to an employee ----
        for p in (
            s.query(PayoutModel)
            .filter(
                PayoutModel.is_deleted.is_(False),
                PayoutModel.employee_uuid.isnot(None),
                PayoutModel.created_at >= start,
                PayoutModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = bucket(p.created_at)
            if not k:
                continue
            salaries_backed = True
            c = conv.convert(p.amount or 0, p.currency, p.created_at)
            if c is None:
                if p.amount:
                    unconv_amt += p.amount or 0
                    unconv_count += 1
                continue
            by_period[k][_SALARIES_KEY] += c
            seg_totals[_SALARIES_KEY] += c

    # segment order: salaries first, then expense categories in their enum order,
    # then any stray stored value — but only segments that actually have spend
    canonical = [_SALARIES_KEY] + [c.value for c in ExpenseCategory]
    present = {k for k, v in seg_totals.items() if round(v, 2) != 0}
    categories = [k for k in canonical if k in present]
    categories += sorted(k for k in present if k not in canonical)

    groups = []
    for k in key_order:
        row = by_period[k]
        breakdown = {seg: round(row.get(seg, 0.0), 2) for seg in categories}
        groups.append(
            {
                "period_label": k,
                "period_start": starts[k].strftime("%Y-%m-%d"),
                "total": round(sum(row.get(seg, 0.0) for seg in categories), 2),
                "breakdown": breakdown,
            }
        )

    return jsonify(
        {
            "target_currency": target.value,
            "granularity": gran,
            "categories": categories,
            "groups": groups,
            "disclosure": {
                "unconverted_amount": round(unconv_amt, 2),
                "unconverted_count": unconv_count,
                # false until an employee payout exists; lets a client note that
                # salaries are not tracked rather than imply a real zero
                "salaries_backed": salaries_backed,
            },
        }
    ), 200


# ---------------------------------------------------------------------------
# Customer orders count — a stacked bar per period: orders by NEW customers vs
# orders by RETURNING customers, over day / week / month / quarter / year.
# Counts of orders, not money, so no currency is involved.
# ---------------------------------------------------------------------------

# Daily is offered here (nothing money-based needs it) for the short-horizon
# pulse; 14 single stacked bars still read fine at phone width.
_ORDERS_CAPS = {"year": 6, "quarter": 8, "month": 12, "week": 12, "day": 14}


@dashboard_blueprint.route("/customer-orders", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def customer_orders_count():
    """Order counts per period, split into new vs returning customers.

    An order counts as NEW when it falls in the period containing its customer's
    first-ever order, at the chart's own granularity. That single rule produces
    exactly the requested semantics:

      * "no previous purchases at the time of the order" — a customer's first
        period is the one holding their first order;
      * a repeat purchase INSIDE that same period still counts as new (the
        became-returning flip only shows from the next period on);
      * the same customer reads as new in July and returning in August on a
        monthly chart — and the whole of 2026 as new on a yearly one, because
        the comparison is between period KEYS at the current granularity.

    The first-order date is taken over ALL orders (not just the window), so a
    customer acquired before the window correctly reads as returning, and
    new + returning always equals the period's total.
    """
    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _ORDERS_CAPS:
        gran = "month"
    cap = _ORDERS_CAPS[gran]
    try:
        periods = max(1, min(cap, int(request.args.get("periods", cap))))
    except ValueError:
        periods = cap

    now = datetime.utcnow()
    period_starts = [_step_back(now, gran, periods - 1 - i) for i in range(periods)]
    start = period_starts[0]
    key_order = [_period_key(ps, gran) for ps in period_starts]
    starts = {_period_key(ps, gran): ps for ps in period_starts}

    new_orders: dict = defaultdict(int)
    repeat_orders: dict = defaultdict(int)

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session

        # each customer's first-ever order date — one aggregate over the whole
        # account, deliberately unwindowed: history before the window is exactly
        # what makes a customer "returning" inside it
        first_by_customer = dict(
            s.query(
                CustomerOrderModel.customer_uuid,
                func.min(CustomerOrderModel.created_at),
            )
            .filter(
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.account_uuid == uow.account_uuid,
            )
            .group_by(CustomerOrderModel.customer_uuid)
            .all()
        )

        for cust, created in (
            s.query(CustomerOrderModel.customer_uuid, CustomerOrderModel.created_at)
            .filter(
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.created_at >= start,
                CustomerOrderModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = _period_key(created, gran)
            if k not in starts:
                continue
            first = first_by_customer.get(cust)
            # a window order always has a first (it is itself a candidate); the
            # get() only guards a pathological read skew
            if first is not None and _period_key(first, gran) == k:
                new_orders[k] += 1
            else:
                repeat_orders[k] += 1

    groups = []
    for k in key_order:
        ps = starts[k]
        groups.append(
            {
                # daily keys are long; a short md label keeps 14 bars readable.
                # the full date stays available in period_start.
                "period_label": ps.strftime("%m-%d") if gran == "day" else k,
                "period_start": ps.strftime("%Y-%m-%d"),
                "total": new_orders[k] + repeat_orders[k],
                "new_customer_orders": new_orders[k],
                "repeat_customer_orders": repeat_orders[k],
            }
        )

    return jsonify({"granularity": gran, "groups": groups}), 200


# ---------------------------------------------------------------------------
# Trip stops — a stacked bar per period: how many trip stops each user worked,
# over day / week / month / quarter / year buckets. Counts, so no currency.
# ---------------------------------------------------------------------------

# Legends stop being legible past this many users; the rest aggregate into a
# reserved "__others__" segment so every period's bar still shows its true total.
_TRIP_STOP_TOP_USERS = 8
# Reserved segment keys, dunder-fenced so a real username can never collide.
_OTHERS_KEY = "__others__"
_UNASSIGNED_KEY = "__unassigned__"


@dashboard_blueprint.route("/trip-stops", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def trip_stops():
    """Trip-stop counts per period, split per assigned user.

    A stop is counted at its own created_at (for planned stops that is the
    planning moment, for manual field stops the visit itself — in this data the
    two almost always share the trip's day) and attributed to its TRIP's
    assignee: the user on the start_trip task result, the same resolution the
    trips screens use for "Assigned To", stored as uuid-or-username and mapped
    to a username here. Stops of unassigned trips land in a reserved
    "__unassigned__" segment rather than vanishing; beyond the top N users by
    total the rest aggregate into "__others__" so each bar keeps its true
    height. Stops have no soft-delete of their own; their trip's is respected.
    """
    from models.common import (
        Task as TaskModel,
        TaskExecution as TaskExecutionModel,
        TripStop as TripStopModel,
        User as UserModel,
    )

    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _ORDERS_CAPS:
        gran = "month"
    cap = _ORDERS_CAPS[gran]
    try:
        periods = max(1, min(cap, int(request.args.get("periods", cap))))
    except ValueError:
        periods = cap

    now = datetime.utcnow()
    period_starts = [_step_back(now, gran, periods - 1 - i) for i in range(periods)]
    start = period_starts[0]
    key_order = [_period_key(ps, gran) for ps in period_starts]
    starts = {_period_key(ps, gran): ps for ps in period_starts}

    by_period: dict = defaultdict(lambda: defaultdict(int))
    seg_totals: dict = defaultdict(int)

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session

        rows = (
            s.query(TripStopModel.created_at, TripModel.workflow_execution_uuid)
            .join(TripModel, TripStopModel.trip_uuid == TripModel.uuid)
            .filter(
                TripModel.is_deleted.is_(False),
                TripStopModel.created_at >= start,
                TripStopModel.account_uuid == uow.account_uuid,
            )
            .all()
        )

        # batched assignee resolution, one query for every execution in the
        # window — the same start_trip-task source the trip list route reads
        wfes = {w for _, w in rows if w}
        assigned_by_wfe: dict = {}
        if wfes:
            for wfe_uuid, v in (
                s.query(
                    TaskExecutionModel.workflow_execution_uuid,
                    TaskExecutionModel.result["assigned_user_uuid"].astext,
                )
                .join(TaskModel, TaskModel.uuid == TaskExecutionModel.task_uuid)
                .filter(
                    TaskExecutionModel.workflow_execution_uuid.in_(wfes),
                    TaskExecutionModel.account_uuid == uow.account_uuid,
                    TaskModel.operator == "start_trip_operator",
                )
                .all()
            ):
                if v:
                    assigned_by_wfe[wfe_uuid] = v
        # the stored value is uuid-or-username; map uuids to usernames and pass
        # usernames through — mirroring the trip list route's resolution
        uuid_to_name = dict(
            s.query(UserModel.uuid, UserModel.username)
            .filter(UserModel.account_uuid == uow.account_uuid)
            .all()
        )

        for created, wfe in rows:
            k = _period_key(created, gran)
            if k not in starts:
                continue
            v = assigned_by_wfe.get(wfe)
            seg = uuid_to_name.get(v, v) if v else _UNASSIGNED_KEY
            by_period[k][seg] += 1
            seg_totals[seg] += 1

    # rank real users by total; beyond the top N they fold into __others__, and
    # __unassigned__ always sits last so it reads as the residue it is
    real = sorted(
        (k for k in seg_totals if k != _UNASSIGNED_KEY),
        key=lambda k: -seg_totals[k],
    )
    top, rest = real[:_TRIP_STOP_TOP_USERS], real[_TRIP_STOP_TOP_USERS:]
    users = list(top)
    if rest:
        users.append(_OTHERS_KEY)
    if seg_totals.get(_UNASSIGNED_KEY):
        users.append(_UNASSIGNED_KEY)

    groups = []
    for k in key_order:
        row = by_period[k]
        breakdown = {u: row.get(u, 0) for u in top}
        if rest:
            breakdown[_OTHERS_KEY] = sum(row.get(u, 0) for u in rest)
        if seg_totals.get(_UNASSIGNED_KEY):
            breakdown[_UNASSIGNED_KEY] = row.get(_UNASSIGNED_KEY, 0)
        ps = starts[k]
        groups.append(
            {
                "period_label": ps.strftime("%m-%d") if gran == "day" else k,
                "period_start": ps.strftime("%Y-%m-%d"),
                "total": sum(row.values()),
                "breakdown": breakdown,
            }
        )

    return jsonify(
        {
            "granularity": gran,
            # ordered segment keys: usernames, then __others__/__unassigned__ —
            # both reserved keys are dunder-fenced so no username collides
            "users": users,
            "groups": groups,
            "disclosure": {
                # how many real users were folded into __others__
                "users_grouped": len(rest),
            },
        }
    ), 200


# ---------------------------------------------------------------------------
# Materials sold — for ONE period (this month, last week, ...), a stacked bar
# per MATERIAL: quantity sold via customer-order items, split into fulfilled vs
# unfulfilled. Quantities are in each material's own unit and are never summed
# across materials — which is why the x-axis is materials, not time.
# ---------------------------------------------------------------------------

# Bars are materials, so the time dimension collapses to one window; `offset`
# steps that window back (0 = the current period). More material bars than this
# turn into a smear at phone width, so the chart carries the top N by quantity
# and reports how many it left out.
_MATERIALS_TOP_N = 12
_MATERIALS_MAX_OFFSET = 120


@dashboard_blueprint.route("/materials-sold", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def materials_sold():
    """Quantities of materials sold in one period, fulfilled vs unfulfilled.

    Sold = customer-order items, bucketed by their ORDER's created_at (the same
    convention as revenue: the sale happens when the order is placed), with the
    order's and the item's soft-deletes both respected. Fulfilled means the item
    is marked fulfilled (fulfilled_at set — the model's own convention, and
    is_fulfilled tracks it 1:1), regardless of WHEN that happened: this answers
    "of what was ordered in this period, how much has been delivered by now".

    Grouping is by (material, item unit): materials are never summed with each
    other — quantities only mean anything in their own unit — and the unit is
    carried per bar so a client can label it. A material sold in two units would
    become two bars rather than one dishonest sum.
    """
    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _ORDERS_CAPS:
        gran = "month"
    try:
        offset = max(0, min(_MATERIALS_MAX_OFFSET, int(request.args.get("offset", 0))))
    except ValueError:
        offset = 0

    now = datetime.utcnow()
    start = _step_back(now, gran, offset)
    end = _step_back(now, gran, offset - 1)  # next period's start

    # (material_uuid, unit) -> [fulfilled_qty, unfulfilled_qty, name]
    agg: dict = {}

    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session
        from models.common import (
            CustomerOrderItem as ItemModel,
            Material as MaterialModel,
        )

        rows = (
            s.query(
                ItemModel.material_uuid,
                ItemModel.unit,
                ItemModel.quantity,
                ItemModel.fulfilled_at,
                MaterialModel.name,
            )
            .join(
                CustomerOrderModel,
                ItemModel.customer_order_uuid == CustomerOrderModel.uuid,
            )
            # no is_deleted filter on Material: a retired material's history is
            # still history, and its name is still the honest label
            .join(MaterialModel, ItemModel.material_uuid == MaterialModel.uuid)
            .filter(
                ItemModel.is_deleted.is_(False),
                CustomerOrderModel.is_deleted.is_(False),
                CustomerOrderModel.created_at >= start,
                CustomerOrderModel.created_at < end,
                ItemModel.account_uuid == uow.account_uuid,
            )
            .all()
        )
        for mat_uuid, unit, qty, fulfilled_at, name in rows:
            key = (mat_uuid, unit or "")
            if key not in agg:
                agg[key] = [0, 0, name]
            agg[key][0 if fulfilled_at is not None else 1] += qty or 0

    ranked = sorted(
        (
            {
                "material_uuid": mu,
                "name": rec[2],
                "unit": unit,
                "total": rec[0] + rec[1],
                "fulfilled": rec[0],
                "unfulfilled": rec[1],
            }
            for (mu, unit), rec in agg.items()
        ),
        key=lambda m: -m["total"],
    )

    return jsonify(
        {
            "granularity": gran,
            "offset": offset,
            "period_label": _period_key(start, gran),
            "period_start": start.strftime("%Y-%m-%d"),
            "materials": ranked[:_MATERIALS_TOP_N],
            "disclosure": {
                # bars beyond the top N by quantity — reported, never silent
                "materials_omitted": max(0, len(ranked) - _MATERIALS_TOP_N),
            },
        }
    ), 200


# ---------------------------------------------------------------------------
# New customers — a plain bar per period: how many customers were CREATED in
# it, over day / week / month / quarter / year buckets. A count of people
# joining the book, not of their purchases — the customer-orders dashboard's
# "new" segment answers the purchasing side.
# ---------------------------------------------------------------------------


@dashboard_blueprint.route("/new-customers", methods=["GET"])
@jwt_required()
@scopes_required(
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
def new_customers():
    """Newly created customers per period.

    Created = Customer.created_at, soft-deletes excluded — the same definition
    the overview's new_customers series uses, here with the full granularity
    range instead of a fixed daily window. One series, so the client draws a
    plain (unstacked) bar chart.
    """
    gran = (request.args.get("granularity") or "month").strip().lower()
    if gran not in _ORDERS_CAPS:
        gran = "month"
    cap = _ORDERS_CAPS[gran]
    try:
        periods = max(1, min(cap, int(request.args.get("periods", cap))))
    except ValueError:
        periods = cap

    now = datetime.utcnow()
    period_starts = [_step_back(now, gran, periods - 1 - i) for i in range(periods)]
    start = period_starts[0]
    key_order = [_period_key(ps, gran) for ps in period_starts]
    starts = {_period_key(ps, gran): ps for ps in period_starts}

    counts: dict = defaultdict(int)
    with SqlAlchemyUnitOfWork() as uow:
        s = uow.session
        for (created,) in (
            s.query(CustomerModel.created_at)
            .filter(
                CustomerModel.is_deleted.is_(False),
                CustomerModel.created_at >= start,
                CustomerModel.account_uuid == uow.account_uuid,
            )
            .all()
        ):
            k = _period_key(created, gran)
            if k in starts:
                counts[k] += 1

    groups = []
    for k in key_order:
        ps = starts[k]
        groups.append(
            {
                "period_label": ps.strftime("%m-%d") if gran == "day" else k,
                "period_start": ps.strftime("%Y-%m-%d"),
                "count": counts[k],
            }
        )

    return jsonify({"granularity": gran, "groups": groups}), 200
