"""A plan's arithmetic: what model cost a price buys, and how full the allowance is."""
from __future__ import annotations

import pytest

from assistant.plan import Plan, company_plan, merge_platform
from assistant.registry import PLATFORM_DEFAULTS

PLATFORM = {"enabled_by_default": False, "plan_price_usd": 20.0, "margin_pct": 20.0, "user_messages_per_hour": 60}


@pytest.mark.parametrize("price, margin, cap", [
    (20.0, 20.0, 16.0),
    (20.0, 0.0, 20.0),
    (50.0, 75.0, 12.5),
    (0.0, 20.0, 0.0),
])
def test_the_cost_cap_is_the_price_less_the_margin(price, margin, cap):
    assert Plan(price_usd=price, margin_pct=margin).cost_cap_usd == pytest.approx(cap)


@pytest.mark.parametrize("spent, pct", [(0.0, 0), (3.99, 24), (15.99, 99), (16.0, 100), (40.0, 100)])
def test_used_pct_rounds_down_and_stops_at_100(spent, pct):
    assert Plan(price_usd=20.0, margin_pct=20.0).used_pct(spent) == pct


def test_a_plan_without_a_price_has_no_cap():
    plan = Plan(price_usd=None, margin_pct=20.0)
    assert (plan.cost_cap_usd, plan.used_pct(1e6), plan.exhausted(1e6)) == (None, None, False)


def test_a_zero_price_plan_is_used_up_from_the_start():
    plan = Plan(price_usd=0.0, margin_pct=20.0)
    assert plan.exhausted(0.0) and plan.used_pct(0.0) == 100


def test_a_company_follows_the_platform_where_it_has_no_value_of_its_own():
    got = company_plan(PLATFORM, {"enabled": True, "plan_price_usd": None, "margin_pct": 50.0})
    assert got.enabled and got.plan == Plan(price_usd=20.0, margin_pct=50.0)


def test_a_company_with_no_settings_gets_the_platform_plan():
    got = company_plan(PLATFORM, {})
    assert not got.enabled and got.plan == Plan(price_usd=20.0, margin_pct=20.0)
    assert got.user_messages_per_hour == 60


def test_a_company_can_override_the_questions_per_hour_limit():
    assert company_plan(PLATFORM, {"user_messages_per_hour": 5}).user_messages_per_hour == 5


def test_saved_platform_values_win_over_defaults_including_null():
    merged = merge_platform({"plan_price_usd": None, "unknown_key": 1})
    assert merged["plan_price_usd"] is None and "unknown_key" not in merged
    assert merged["margin_pct"] == PLATFORM_DEFAULTS["margin_pct"]
