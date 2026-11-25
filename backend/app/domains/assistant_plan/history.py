"""Each company's assistant cost and profit, billing month by billing month.

History starts at the assistant's first use or first recorded plan, whichever is
earlier, and is served a page at a time, newest first.

A month is priced with the plan in effect on its first day, which is also what an
invoice for it charges. Plan changes are kept in `assistant_plan_change`; a month
that began before the history did is priced with the oldest recorded plan, counts
as earning only if the company used the assistant in it, and is marked `estimated`.
"""
from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Optional

from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from assistant.plan import CompanyPlan, company_plan
from billing_cycle import damascus_date, day_start_utc, periods_since
from models.common import AssistantPlanChange, AssistantUsage

PLAN_FIELDS = ("enabled", "plan_price_usd", "margin_pct")


@dataclass(frozen=True)
class PlanChange:
    effective_at: datetime
    enabled: Optional[bool]
    plan_price_usd: Optional[float]
    margin_pct: Optional[float]


@dataclass(frozen=True)
class MonthUsage:
    questions: int
    cost_usd: float


@dataclass(frozen=True)
class BillingMonth:
    period_start: date
    period_end: date
    in_progress: bool
    estimated: bool
    questions: int
    cost_usd: float
    budget_usd: Optional[float]      # None: the assistant was off, so nothing was earned
    margin_pct: float
    cost_cap_usd: Optional[float]
    hit_cap: bool
    profit_usd: Optional[float]
    profit_pct: Optional[float]

    def to_json(self) -> dict:
        return {**asdict(self), "period_start": self.period_start.isoformat(),
                "period_end": self.period_end.isoformat()}


def profit_pct(revenue: Optional[float], profit: Optional[float]) -> Optional[float]:
    """Profit as a share of what the plan earns; None when it earns nothing."""
    if not revenue or profit is None:
        return None
    return round(profit / revenue * 100, 1)


def record_change(uow: SqlAlchemyUnitOfWork, account_uuid: Optional[str], values: dict,
                  created_by_uuid: Optional[str]) -> None:
    """Append the plan as just saved. `account_uuid` None records the platform defaults,
    whose switch is saved as `enabled_by_default`."""
    enabled = values["enabled"] if account_uuid else values["enabled_by_default"]
    uow.session.add(AssistantPlanChange(
        account_uuid=account_uuid,
        enabled=enabled,
        plan_price_usd=values["plan_price_usd"],
        margin_pct=values["margin_pct"],
        effective_at=datetime.utcnow(),
        created_by_uuid=created_by_uuid,
    ))


def load_changes(uow: SqlAlchemyUnitOfWork) -> dict[Optional[str], list[PlanChange]]:
    """Every recorded plan, oldest first, keyed by account (None = platform)."""
    rows = uow.session.query(AssistantPlanChange).order_by(AssistantPlanChange.effective_at).all()
    out: dict[Optional[str], list[PlanChange]] = defaultdict(list)
    for row in rows:
        out[row.account_uuid].append(PlanChange(row.effective_at, row.enabled, row.plan_price_usd, row.margin_pct))
    return out


def _in_effect(changes: list[PlanChange], at: datetime) -> Optional[PlanChange]:
    """The latest change at or before `at`, else the oldest one."""
    if not changes:
        return None
    i = bisect_right([c.effective_at for c in changes], at)
    return changes[i - 1] if i else changes[0]


def plan_at(platform_now: dict, changes: dict[Optional[str], list[PlanChange]], account_uuid: str,
            at: datetime) -> CompanyPlan:
    """The company's plan in effect at `at`, from the recorded history."""
    platform = dict(platform_now)
    recorded = _in_effect(changes.get(None, []), at)
    if recorded:
        platform.update(enabled_by_default=recorded.enabled, plan_price_usd=recorded.plan_price_usd,
                        margin_pct=recorded.margin_pct)
    own = _in_effect(changes.get(account_uuid, []), at)
    return company_plan(platform, {f: getattr(own, f) for f in PLAN_FIELDS} if own else {})


def history_start(changes: dict[Optional[str], list[PlanChange]]) -> Optional[datetime]:
    starts = [c[0].effective_at for c in changes.values() if c]
    return min(starts) if starts else None


def bucket_usage(rows: list[tuple[datetime, float]], periods: list[tuple[date, date]]) -> list[MonthUsage]:
    """Sum (created_at, cost) rows into the periods they fall in."""
    bounds = [day_start_utc(start) for start, _ in periods] + [day_start_utc(periods[-1][1])]
    questions = [0] * len(periods)
    cost = [0.0] * len(periods)
    for created_at, cost_usd in rows:
        i = bisect_right(bounds, created_at) - 1
        if 0 <= i < len(periods):
            questions[i] += 1
            cost[i] += cost_usd or 0.0
    return [MonthUsage(q, c) for q, c in zip(questions, cost)]


def billing_month(period: tuple[date, date], usage: MonthUsage, plan: CompanyPlan, today: date,
                  estimated: bool) -> BillingMonth:
    # without a record, an unused month is no evidence the assistant was on at all
    earning = plan.enabled and (usage.questions > 0 or not estimated)
    budget = plan.plan.price_usd if earning else None
    profit = None if budget is None else budget - usage.cost_usd
    return BillingMonth(
        period_start=period[0],
        period_end=period[1],
        in_progress=period[0] <= today < period[1],
        estimated=estimated,
        questions=usage.questions,
        cost_usd=round(usage.cost_usd, 4),
        budget_usd=budget,
        margin_pct=plan.plan.margin_pct,
        cost_cap_usd=None if plan.plan.cost_cap_usd is None else round(plan.plan.cost_cap_usd, 4),
        hit_cap=plan.plan.exhausted(usage.cost_usd),
        profit_usd=None if profit is None else round(profit, 4),
        profit_pct=profit_pct(budget, profit),
    )


def _usage_by_account(uow: SqlAlchemyUnitOfWork, account_uuids: list[str],
                      since: date, until: date) -> dict[str, list[tuple[datetime, float]]]:
    rows = (uow.session.query(AssistantUsage.account_uuid, AssistantUsage.created_at, AssistantUsage.cost_usd)
            .filter(AssistantUsage.account_uuid.in_(account_uuids),
                    AssistantUsage.created_at >= day_start_utc(since),
                    AssistantUsage.created_at < day_start_utc(until))
            .all())
    out: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    for account_uuid, created_at, cost in rows:
        out[account_uuid].append((created_at, float(cost or 0.0)))
    return out


def platform_months(months_by_company: dict[str, list[BillingMonth]]) -> list[dict]:
    """All companies together, by the calendar month each billing month begins in."""
    totals: dict[str, dict] = {}
    for months in months_by_company.values():
        for m in months:
            key = m.period_start.strftime("%Y-%m")
            t = totals.setdefault(key, {"month": key, "questions": 0, "cost_usd": 0.0, "budget_usd": 0.0,
                                        "companies_at_cap": 0, "estimated": False})
            t["questions"] += m.questions
            t["cost_usd"] += m.cost_usd
            t["budget_usd"] += m.budget_usd or 0.0
            t["companies_at_cap"] += int(m.hit_cap)
            t["estimated"] = t["estimated"] or m.estimated
    out = []
    for key in sorted(totals):
        t = totals[key]
        profit = t["budget_usd"] - t["cost_usd"]
        out.append({**t, "cost_usd": round(t["cost_usd"], 4), "budget_usd": round(t["budget_usd"], 2),
                    "profit_usd": round(profit, 4), "profit_pct": profit_pct(t["budget_usd"], profit)})
    return out


@dataclass(frozen=True)
class Page:
    items: list
    total_count: int


def activity_start(uow: SqlAlchemyUnitOfWork) -> Optional[date]:
    """The first day the assistant was used or a plan was recorded: no month before it
    has anything to show."""
    first_use = uow.session.query(func.min(AssistantUsage.created_at)).scalar()
    first_plan = uow.session.query(func.min(AssistantPlanChange.effective_at)).scalar()
    firsts = [d for d in (first_use, first_plan) if d is not None]
    return damascus_date(min(firsts)) if firsts else None


def _page_slice(total: int, page: int, per_page: int) -> slice:
    """Newest first: page 1 is the most recent `per_page` items of an oldest-first list."""
    end = total - (page - 1) * per_page
    return slice(max(0, end - per_page), max(0, end))


def _months_for(uow: SqlAlchemyUnitOfWork, platform_now: dict, periods: dict[str, list[tuple[date, date]]],
                today: date) -> dict[str, list[BillingMonth]]:
    """Billing months for each company's given periods, oldest first."""
    wanted = {uuid: p for uuid, p in periods.items() if p}
    if not wanted:
        return {}
    changes = load_changes(uow)
    started = history_start(changes)
    since = min(p[0][0] for p in wanted.values())
    until = max(p[-1][1] for p in wanted.values())
    usage = _usage_by_account(uow, list(wanted), since, until)
    out = {}
    for account_uuid, account_periods in wanted.items():
        months = []
        for period, month_usage in zip(account_periods, bucket_usage(usage.get(account_uuid, []), account_periods)):
            begins = day_start_utc(period[0])
            months.append(billing_month(period, month_usage, plan_at(platform_now, changes, account_uuid, begins),
                                        today, estimated=started is None or begins < started))
        out[account_uuid] = months
    return out


def company_page(uow: SqlAlchemyUnitOfWork, platform_now: dict, account_uuid: str, anchor: date, today: date,
                 page: int, per_page: int) -> Page:
    """One page of a company's billing months since the assistant started, newest first."""
    start = activity_start(uow)
    if start is None:
        return Page(items=[], total_count=0)
    periods = periods_since(anchor, start, today)
    chosen = periods[_page_slice(len(periods), page, per_page)]
    months = _months_for(uow, platform_now, {account_uuid: chosen}, today).get(account_uuid, [])
    return Page(items=list(reversed(months)), total_count=len(periods))


def _calendar_months(first: date, last: date) -> list[str]:
    out, (y, m) = [], (first.year, first.month)
    while (y, m) <= (last.year, last.month):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def platform_page(uow: SqlAlchemyUnitOfWork, platform_now: dict, anchors: dict[str, date], today: date,
                  page: int, per_page: int) -> Page:
    """One page of calendar months since the assistant started, newest first, each
    totalling every company's billing month that begins in it."""
    start = activity_start(uow)
    if start is None or not anchors:
        return Page(items=[], total_count=0)
    all_periods = {uuid: periods_since(anchor, start, today) for uuid, anchor in anchors.items()}
    # a billing month that began before the first activity still holds it
    first = min(p[0][0] for p in all_periods.values())
    keys = _calendar_months(first, today)
    chosen = set(keys[_page_slice(len(keys), page, per_page)])
    periods = {uuid: [p for p in account_periods if p[0].strftime("%Y-%m") in chosen]
               for uuid, account_periods in all_periods.items()}
    by_key = {row["month"]: row for row in platform_months(_months_for(uow, platform_now, periods, today))}
    rows = [by_key.get(key) or empty_month(key) for key in sorted(chosen, reverse=True)]
    return Page(items=rows, total_count=len(keys))


def empty_month(key: str) -> dict:
    return {"month": key, "questions": 0, "cost_usd": 0.0, "budget_usd": 0.0, "companies_at_cap": 0,
            "estimated": False, "profit_usd": 0.0, "profit_pct": None}
