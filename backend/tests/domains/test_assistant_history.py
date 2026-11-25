"""A company's assistant cost and profit, billing month by billing month."""
from datetime import date, datetime

import pytest

from app.domains.assistant_plan.history import (
    MonthUsage,
    PlanChange,
    billing_month,
    bucket_usage,
    plan_at,
    platform_months,
)
from assistant.plan import CompanyPlan, Plan
from billing_cycle import day_start_utc, recent_periods

ANCHOR = date(2026, 1, 19)
TODAY = date(2026, 4, 2)
PLATFORM_NOW = {"enabled_by_default": True, "plan_price_usd": 10.0, "margin_pct": 30.0,
                "user_messages_per_hour": 10}
ACCOUNT = "acct-1"


def change(when, enabled=None, price=None, margin=None):
    return PlanChange(effective_at=when, enabled=enabled, plan_price_usd=price, margin_pct=margin)


def test_recent_periods_end_with_the_current_month_and_never_precede_the_anchor():
    assert recent_periods(ANCHOR, TODAY, 12) == [
        (date(2026, 1, 19), date(2026, 2, 19)),
        (date(2026, 2, 19), date(2026, 3, 19)),
        (date(2026, 3, 19), date(2026, 4, 19)),
    ]
    assert recent_periods(ANCHOR, TODAY, 1) == [(date(2026, 3, 19), date(2026, 4, 19))]


def test_usage_lands_in_the_billing_month_it_happened_in():
    periods = recent_periods(ANCHOR, TODAY, 3)
    rows = [
        (day_start_utc(date(2026, 2, 19)), 1.0),                    # first moment of month 2
        (datetime(2026, 2, 18, 20, 59), 0.5),                        # last minute of month 1 (Damascus)
        (datetime(2026, 3, 30, 10), 2.0),
        (datetime(2025, 12, 1), 9.0),                                # before the grid: ignored
    ]
    got = bucket_usage(rows, periods)
    assert [(m.questions, m.cost_usd) for m in got] == [(1, 0.5), (1, 1.0), (1, 2.0)]


def test_a_month_is_priced_with_the_plan_in_effect_on_its_first_day():
    changes = {
        None: [change(datetime(2026, 1, 1), enabled=True, price=10.0, margin=30.0)],
        ACCOUNT: [change(datetime(2026, 1, 1), price=20.0),
                  change(datetime(2026, 3, 1), price=50.0, margin=10.0)],
    }
    february = plan_at(PLATFORM_NOW, changes, ACCOUNT, day_start_utc(date(2026, 2, 19)))
    march = plan_at(PLATFORM_NOW, changes, ACCOUNT, day_start_utc(date(2026, 3, 19)))
    assert february.plan == Plan(price_usd=20.0, margin_pct=30.0)
    assert march.plan == Plan(price_usd=50.0, margin_pct=10.0)


def test_a_month_before_any_recorded_plan_uses_the_oldest_one():
    changes = {None: [change(datetime(2026, 3, 1), enabled=True, price=15.0, margin=20.0)]}
    plan = plan_at(PLATFORM_NOW, changes, ACCOUNT, day_start_utc(date(2026, 1, 19)))
    assert plan.plan == Plan(price_usd=15.0, margin_pct=20.0)


PERIOD = (date(2026, 3, 19), date(2026, 4, 19))
ON = CompanyPlan(enabled=True, plan=Plan(price_usd=20.0, margin_pct=30.0), user_messages_per_hour=10)


@pytest.mark.parametrize("cost, hit_cap, profit, pct", [
    (2.0, False, 18.0, 90.0),
    (14.0, True, 6.0, 30.0),
])
def test_a_billing_month_reports_cost_profit_and_whether_it_hit_the_cap(cost, hit_cap, profit, pct):
    m = billing_month(PERIOD, MonthUsage(questions=4, cost_usd=cost), ON, TODAY, estimated=False)
    assert (m.hit_cap, m.profit_usd, m.profit_pct, m.cost_cap_usd, m.in_progress) == (hit_cap, profit, pct, 14.0, True)


def test_a_month_with_the_assistant_off_earns_nothing():
    off = CompanyPlan(enabled=False, plan=ON.plan, user_messages_per_hour=10)
    m = billing_month(PERIOD, MonthUsage(questions=0, cost_usd=0.0), off, TODAY, estimated=False)
    assert (m.budget_usd, m.profit_usd, m.profit_pct) == (None, None, None)


def test_platform_totals_group_companies_by_the_calendar_month_their_billing_month_starts():
    def month(start, cost, budget):
        plan = CompanyPlan(enabled=True, plan=Plan(price_usd=budget, margin_pct=0.0), user_messages_per_hour=10)
        return billing_month((start, start), MonthUsage(questions=1, cost_usd=cost), plan, TODAY, estimated=False)

    totals = platform_months({
        "a": [month(date(2026, 3, 5), 1.0, 10.0)],
        "b": [month(date(2026, 3, 19), 3.0, 20.0)],
    })
    assert totals == [{"month": "2026-03", "questions": 2, "cost_usd": 4.0, "budget_usd": 30.0,
                       "companies_at_cap": 0, "estimated": False, "profit_usd": 26.0, "profit_pct": 86.7}]


@pytest.mark.parametrize("questions, earns", [(0, False), (3, True)])
def test_an_untracked_month_earns_only_if_the_assistant_was_used(questions, earns):
    m = billing_month(PERIOD, MonthUsage(questions=questions, cost_usd=0.1), ON, TODAY, estimated=True)
    assert (m.budget_usd is not None) is earns, f"{questions} questions in an untracked month"


def test_a_billing_month_serializes_dates_as_iso():
    m = billing_month(PERIOD, MonthUsage(questions=0, cost_usd=0.0), ON, TODAY, estimated=False)
    assert (m.to_json()["period_start"], m.to_json()["period_end"]) == ("2026-03-19", "2026-04-19")
