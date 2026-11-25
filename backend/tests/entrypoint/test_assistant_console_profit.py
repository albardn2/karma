"""Profit as the console reports it: a share of what the assistant plan earns."""
import pytest

from app.entrypoint.routes.super_admin.assistant import _profit_pct


@pytest.mark.parametrize("revenue, profit, expected", [
    (20.0, 16.0, 80.0),
    (20.0, 19.9348, 99.7),
    (20.0, -2.0, -10.0),
])
def test_profit_is_a_share_of_the_plan_price(revenue, profit, expected):
    assert _profit_pct(revenue, profit) == expected


@pytest.mark.parametrize("revenue, profit", [(None, None), (0.0, -0.5)])
def test_a_plan_that_earns_nothing_has_no_profit_share(revenue, profit):
    assert _profit_pct(revenue, profit) is None
