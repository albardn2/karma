"""Production rules: who may ask, how much, on which model, and what gets recorded."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from assistant import db, server
from billing_cycle import add_months, damascus_today
from assistant.policy import Policy
from assistant.registry import DEFAULT_MODEL_ID
from assistant.store import Store, Stored, _now, owner_key

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
        t = db.usage
        with store.engine.begin() as c:
            newest = c.execute(select(t.c.uuid).order_by(t.c.created_at.desc()).limit(1)).scalar()
            c.execute(t.update().where(t.c.uuid == newest).values(created_at=when))


def set_anchor(store: Store, account: str, verified_on: date):
    """The company's billing grid starts on `verified_on`."""
    verified_at = datetime(verified_on.year, verified_on.month, verified_on.day, 12)
    with store.engine.begin() as c:
        c.execute(db.account.delete().where(db.account.c.uuid == account))
        c.execute(db.account.insert().values(uuid=account, created_at=verified_at - timedelta(days=30),
                                             verified_at=verified_at))


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
    assert got["access"]["code"] == "off"
    # the apps hide the button for a company that isn't switched on
    assert client.get("/assistant/access", headers=A).json()["code"] == "off"
    assert client.get("/assistant/access").status_code == 401


# ------------------------------------------------------------------ plan & rate

PRICE_USD = 10.0
MARGIN_PCT = 20.0
COST_CAP_USD = 8.0          # the price less the margin


def plan_platform(store: Store, **overrides):
    set_platform(store, {"enabled_by_default": True, "plan_price_usd": PRICE_USD, "margin_pct": MARGIN_PCT,
                         **overrides})


def test_the_allowance_is_the_price_less_the_margin(store):
    plan_platform(store)
    me = USERS["tok-a"]
    spend(store, me, COST_CAP_USD - 0.1)
    access = Policy(store).check(me)
    assert access.allowed and access.used_pct == 98, f"7.9 of an 8.0 cap is 98%, got {access.used_pct}"
    spend(store, me, 0.5)
    access = Policy(store).check(me)
    assert (access.allowed, access.status, access.code, access.used_pct) == (False, 429, "budget", 100)


def test_only_the_current_billing_period_counts(store):
    plan_platform(store)
    today = damascus_today()
    set_anchor(store, "acct-1", today - timedelta(days=10))
    me = USERS["tok-a"]
    spend(store, me, COST_CAP_USD, when=_now() - timedelta(days=11))   # before this period opened
    spend(store, me, 2.0, when=_now() - timedelta(days=9))
    access = Policy(store).check(me)
    assert access.allowed and access.used_pct == 25, "only the 2.0 spent this period counts"


def test_the_allowance_resets_on_the_next_billing_date(store):
    plan_platform(store)
    anchor = damascus_today() - timedelta(days=10)
    set_anchor(store, "acct-1", anchor)
    spend(store, USERS["tok-a"], COST_CAP_USD)
    access = Policy(store).check(USERS["tok-a"])
    assert access.resets_on == add_months(anchor, 1)
    assert f"{access.resets_on.day} {access.resets_on:%B %Y}" in access.reason


def test_a_company_without_a_billing_anchor_runs_on_calendar_months(store):
    plan_platform(store)
    me = USERS["tok-a"]
    spend(store, me, COST_CAP_USD, when=_now() - timedelta(days=40))
    access = Policy(store).check(me)
    assert access.allowed and access.used_pct == 0
    assert access.resets_on.day == 1


def test_company_plan_overrides_platform_plan_and_is_per_company(store):
    plan_platform(store)
    set_account(store, "acct-1", plan_price_usd=100.0, margin_pct=50.0)
    spend(store, USERS["tok-a"], COST_CAP_USD)
    assert Policy(store).check(USERS["tok-b"]).used_pct == 16       # same company: 8 of its 50 cap
    spend(store, USERS["tok-s-imp"], COST_CAP_USD)                  # acct-9, on the platform plan
    assert not Policy(store).check(USERS["tok-s-imp"]).allowed


def test_no_price_means_no_cap_and_no_percentage(store):
    plan_platform(store, plan_price_usd=None)
    spend(store, USERS["tok-a"], 1000.0)
    access = Policy(store).check(USERS["tok-a"])
    assert access.allowed and access.used_pct is None


def test_hourly_rate_limit_per_user(store):
    set_platform(store, {"enabled_by_default": True, "user_messages_per_hour": 2, "plan_price_usd": None})
    me = USERS["tok-a"]
    spend(store, me, 0.0)
    spend(store, me, 0.0)
    assert not Policy(store).check(me).allowed
    assert Policy(store).check(USERS["tok-b"]).allowed               # someone else isn't affected


def test_a_company_limit_overrides_the_platform_questions_per_hour(store):
    set_platform(store, {"enabled_by_default": True, "user_messages_per_hour": 100, "plan_price_usd": None})
    set_account(store, "acct-1", user_messages_per_hour=1)
    spend(store, USERS["tok-a"], 0.0)
    assert not Policy(store).check(USERS["tok-a"]).allowed, "acct-1 allows 1 question an hour"
    spend(store, USERS["tok-s-imp"], 0.0)
    assert Policy(store).check(USERS["tok-s-imp"]).allowed, "acct-9 follows the platform's 100"


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


# ------------------------------------------------------------------ what users see

def test_users_see_the_share_of_the_allowance_used_and_when_it_resets(client):
    ask(client, "hi")
    allowance = client.get("/assistant/access", headers=A).json()["allowance"]
    assert allowance["used_pct"] == 0, "0.01 of the default 16.0 cap rounds down to 0%"
    assert date.fromisoformat(allowance["resets_on"]) > damascus_today()


def test_each_answer_carries_the_updated_allowance(client):
    done = ask(client, "hi")[-1]
    assert done["type"] == "done" and done["allowance"]["used_pct"] == 0


@pytest.mark.parametrize("path", ["/assistant/access", "/assistant/conversation"])
def test_no_dollar_amount_reaches_a_user(client, path):
    events = ask(client, "hi")
    for payload in (events, client.get(path, headers=A).json()):
        assert "usd" not in json.dumps(payload), f"a dollar figure leaked: {payload}"


def test_a_cost_saved_in_an_older_transcript_is_not_shown(client):
    me = USERS["tok-a"]
    legacy = {"kind": "assistant", "text": "old", "charts": [],
              "meta": {"cost_usd": 0.5, "seconds": 2, "model_calls": 1, "tool_calls": 0, "stop_reason": "end_turn"}}
    server.store().save(Stored(owner_key=owner_key(me), user_uuid=me["uuid"], account_uuid="acct-1",
                               conv_id="c", model_id=DEFAULT_MODEL_ID, transcript=[legacy]))
    meta = client.get("/assistant/conversation", headers=A).json()["items"][0]["meta"]
    assert "cost_usd" not in meta and meta["seconds"] == 2
