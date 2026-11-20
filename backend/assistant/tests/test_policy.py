"""Production rules: who may ask, how much, on which model, and what gets recorded."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from assistant import db, server
from assistant.policy import Policy
from assistant.registry import DEFAULT_MODEL_ID
from assistant.store import Store, _now

from test_server import A, USERS, FakeConversation, ask, client  # noqa: F401  (fixture)


def set_platform(store: Store, value: dict):
    with store.engine.begin() as c:
        c.execute(db.platform_setting.delete().where(db.platform_setting.c.key == "assistant"))
        c.execute(db.platform_setting.insert().values(key="assistant", value=value, updated_at=_now()))


def set_account(store: Store, account: str, **values):
    with store.engine.begin() as c:
        c.execute(db.account_setting.delete().where(db.account_setting.c.account_uuid == account))
        c.execute(db.account_setting.insert().values(account_uuid=account, updated_at=_now(), **values))


def spend(store: Store, me: dict, usd: float, when: datetime | None = None):
    store.record_usage(me=me, conv_id="c", model_id=DEFAULT_MODEL_ID, outcome="ok", cost_usd=usd)
    if when:
        with store.engine.begin() as c:
            c.execute(db.usage.update().values(created_at=when))


@pytest.fixture
def store():
    return Store(":memory:")


def post(c, text="hi", headers=A):
    return c.post("/assistant/conversation/messages", json={"text": text}, headers=headers)


# ------------------------------------------------------------------ switch

def test_off_by_default_until_the_platform_owner_switches_it_on(store):
    access = Policy(store).check(USERS["tok-a"])
    assert not access.allowed and access.status == 403


def test_company_switch_overrides_the_platform_default(store):
    set_account(store, "acct-1", enabled=True)
    assert Policy(store).check(USERS["tok-a"]).allowed
    set_platform(store, {"enabled_by_default": True})
    set_account(store, "acct-1", enabled=False)
    assert not Policy(store).check(USERS["tok-a"]).allowed


def test_impersonation_follows_the_impersonated_company(store):
    set_account(store, "acct-9", enabled=True)
    p = Policy(store)
    assert p.check(USERS["tok-s-imp"]).allowed
    assert not p.check(USERS["tok-s"]).allowed


def test_a_switched_off_company_gets_a_reason_not_a_stream(client):
    set_account(server.store(), "acct-1", enabled=False)
    r = post(client)
    assert r.status_code == 403 and "switched on" in r.json()["error"]
    got = client.get("/assistant/conversation", headers=A).json()
    assert got["access"]["allowed"] is False and got["access"]["reason"]


# ------------------------------------------------------------------ budget & rate

def test_monthly_budget_blocks_only_this_month(store):
    set_platform(store, {"enabled_by_default": True, "monthly_budget_usd": 1.0})
    me = USERS["tok-a"]
    spend(store, me, 5.0, when=_now() - timedelta(days=40))       # last month: doesn't count
    assert Policy(store).check(me).allowed
    spend(store, me, 1.0)
    access = Policy(store).check(me)
    assert not access.allowed and access.status == 429 and access.spent_usd == pytest.approx(1.0)


def test_company_budget_overrides_platform_budget_and_is_per_company(store):
    set_platform(store, {"enabled_by_default": True, "monthly_budget_usd": 1.0})
    set_account(store, "acct-1", monthly_budget_usd=10.0)
    spend(store, USERS["tok-a"], 2.0)
    assert Policy(store).check(USERS["tok-b"]).allowed              # same company, under 10
    spend(store, USERS["tok-s-imp"], 1.0)                           # acct-9, platform budget 1
    assert not Policy(store).check(USERS["tok-s-imp"]).allowed


def test_hourly_rate_limit_per_user(store):
    set_platform(store, {"enabled_by_default": True, "user_messages_per_hour": 2, "monthly_budget_usd": None})
    me = USERS["tok-a"]
    spend(store, me, 0.0)
    spend(store, me, 0.0)
    assert not Policy(store).check(me).allowed
    assert Policy(store).check(USERS["tok-b"]).allowed               # someone else isn't affected


# ------------------------------------------------------------------ model

def test_model_comes_from_the_platform_setting_and_falls_back(store, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    set_platform(store, {"model_id": "anthropic:claude-haiku-5-5"})   # not enabled until it passes the eval
    assert Policy(store).model().id == DEFAULT_MODEL_ID
    set_platform(store, {"model_id": "no-such-model"})
    assert Policy(store).model().id == DEFAULT_MODEL_ID


# ------------------------------------------------------------------ records

def test_every_question_is_recorded_for_budgets(client):
    ask(client, "one")
    FakeConversation.instances[-1].fail = True
    ask(client, "two")
    with server.store().engine.connect() as c:
        rows = c.execute(select(db.usage.c.outcome, db.usage.c.cost_usd, db.usage.c.account_uuid)).all()
    assert sorted(r.outcome for r in rows) == ["error", "ok"]
    assert all(r.account_uuid == "acct-1" for r in rows)


def test_writes_are_audit_logged(client):
    ask(client, "hi")
    convo = FakeConversation.instances[-1]
    convo.executor.on_action({"tier": "strong", "method": "DELETE", "path": "/customer/x", "title": "Delete customer",
                              "summary": ["Al Noor"], "body": {}, "decision": "declined",
                              "status_code": None, "error": None})
    with server.store().engine.connect() as c:
        row = c.execute(select(db.action)).mappings().one()
    assert (row["user_uuid"], row["account_uuid"], row["decision"], row["path"]) == \
        ("user-a", "acct-1", "declined", "/customer/x")
