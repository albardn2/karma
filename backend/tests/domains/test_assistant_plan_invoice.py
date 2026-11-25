"""The assistant plan on a company's monthly charge.

Plans are priced in USD and added to the subscription charge for the period,
converted to the subscription currency, once a platform owner turns invoicing on.
"""
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from app.domains.assistant_plan import domain as assistant_plan
from app.domains.billing import domain as billing

PERIOD_START = date(2026, 12, 5)
SUBSCRIPTION = 25.0
PLAN_PRICE = 20.0
USD_SYP = 120.0
UNUSED_UOW = object()   # a flat subscription and faked settings need no session


def _account(currency="USD"):
    return SimpleNamespace(uuid="acct-1", subscription_rate=SUBSCRIPTION, subscription_currency=currency,
                           subscription_type="flat", created_at=datetime(2026, 1, 5), verified_at=None)


@pytest.fixture
def settings(monkeypatch):
    """Platform and company settings the test can change; invoicing on, company on."""
    state = {
        "platform": {"enabled_by_default": False, "plan_price_usd": PLAN_PRICE, "margin_pct": 20.0,
                     "invoice_plans": True},
        "own": SimpleNamespace(enabled=True, plan_price_usd=None, margin_pct=None),
        "rate": USD_SYP,
    }
    monkeypatch.setattr(assistant_plan, "platform_settings", lambda uow: dict(state["platform"]))
    monkeypatch.setattr(assistant_plan, "own_settings",
                        lambda uow, uuids: {"acct-1": state["own"]} if state["own"] else {})
    monkeypatch.setattr(billing, "_usd_rate", lambda uow, account_uuid, currency, on: state["rate"])
    return state


def test_a_usd_plan_is_added_to_the_subscription_charge(settings):
    charge = billing.period_charge(UNUSED_UOW, _account("USD"), PERIOD_START)
    assert charge.amount == pytest.approx(-(SUBSCRIPTION + PLAN_PRICE))
    assert charge.note == "subscription 25.00; assistant plan 20.00 USD"


def test_a_syp_subscription_gets_the_plan_converted_at_the_company_rate(settings):
    charge = billing.period_charge(UNUSED_UOW, _account("SYP"), PERIOD_START)
    assert charge.amount == pytest.approx(-(SUBSCRIPTION + PLAN_PRICE * USD_SYP))
    assert "assistant plan 20.00 USD at 120" in charge.note


@pytest.mark.parametrize("change", [
    pytest.param(lambda s: s["platform"].update(invoice_plans=False), id="invoicing-off"),
    pytest.param(lambda s: s.update(own=SimpleNamespace(enabled=False, plan_price_usd=None, margin_pct=None)),
                 id="assistant-off-for-company"),
    pytest.param(lambda s: s["platform"].update(plan_price_usd=None), id="no-price"),
    pytest.param(lambda s: s.update(own=None), id="no-company-settings-and-off-by-default"),
])
def test_nothing_is_added_when_there_is_no_plan_to_invoice(settings, change):
    change(settings)
    charge = billing.period_charge(UNUSED_UOW, _account("USD"), PERIOD_START)
    assert charge.amount == pytest.approx(-SUBSCRIPTION)


def test_a_company_price_overrides_the_platform_price(settings):
    settings["own"] = SimpleNamespace(enabled=True, plan_price_usd=50.0, margin_pct=None)
    charge = billing.period_charge(UNUSED_UOW, _account("USD"), PERIOD_START)
    assert charge.amount == pytest.approx(-(SUBSCRIPTION + 50.0))


def test_a_missing_exchange_rate_fails_the_charge_instead_of_undercharging(settings):
    settings["rate"] = None
    with pytest.raises(ValueError, match="no USD->SYP rate"):
        billing.period_charge(UNUSED_UOW, _account("SYP"), PERIOD_START)


def test_a_typed_one_off_amount_is_charged_as_typed(settings):
    charge = billing.period_charge(UNUSED_UOW, _account("USD"), PERIOD_START, base=7.5)
    assert charge.amount == pytest.approx(-7.5)
