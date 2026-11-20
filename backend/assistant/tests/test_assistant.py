"""Unit tests for the assistant spike. No network, no model, no database.

    cd backend
    uv run --python 3.12 --with-requirements assistant/requirements.txt python -m pytest assistant/tests -q
"""
from __future__ import annotations

import json
import re

import pytest

from assistant import query_data as qd
from assistant.agent import Conversation
from assistant.karma_client import fill_path
from assistant.providers.base import ProviderTurn, ToolCall
from assistant.registry import MODELS, cost_usd
from assistant.tools import (
    Executor, ToolSpec, endpoint_input_schema, endpoint_tools, harness_tools, load_catalog, permitted, to_text,
)

ADMIN = {"username": "a", "permission_scope": "admin", "effective_permissions": None, "account_permissions": None}
DRIVER = {
    "username": "d", "permission_scope": "driver",
    "effective_permissions": {"endpoints": {"trip": ["read"], "customer": ["read"]}},
    "account_permissions": None,
}
CAPPED_ADMIN = dict(ADMIN, account_permissions={"endpoints": {"customer": ["read"]}})


# --------------------------------------------------------------------------- fakes

class FakeClient:
    """Stands in for KarmaClient. Serves 250 invoices over paginated GET /invoice/."""

    def __init__(self, me=ADMIN):
        self._me = me
        self.calls = []
        self.keys = []
        self.conversation_id = None
        self.invoices = [
            {"uuid": f"i{i}", "customer_uuid": f"c{i % 7}", "currency": "USD" if i % 2 else "SYP",
             "net_amount_due": float(i), "is_overdue": i % 3 == 0, "status": "pending",
             "created_at": f"2026-11-{(i % 28) + 1:02d}T00:00:00Z", "geometry": "BIG"}
            for i in range(250)
        ]

    def me(self):
        return self._me

    def request(self, method, path, params=None, body=None, idempotency_key=None):
        self.calls.append((method, path, dict(params or {}), body))
        self.keys.append(idempotency_key)
        if method != "GET":
            return {"uuid": "new-1", "ok": True}
        if path == "/invoice/":
            page, per = int(params.get("page", 1)), int(params.get("per_page", 20))
            rows = self.invoices
            if params.get("status"):
                rows = [r for r in rows if r["status"] == params["status"]]
            pages = max(1, -(-len(rows) // per))
            return {"invoices": rows[(page - 1) * per: page * per], "total_count": len(rows),
                    "page": page, "per_page": per, "pages": pages}
        if path.startswith("/customer/"):
            return {"uuid": path.rsplit("/", 1)[-1], "company_name": "Al-Noor", "phone_number": "0911",
                    "category": "minimarket"}
        if path.startswith("/material/"):
            return {"uuid": path.rsplit("/", 1)[-1], "name": "Sugar 50kg"}
        return {"ok": True}


def admin_executor(client=None):
    client = client or FakeClient()
    tools = endpoint_tools(ADMIN)
    tools = harness_tools(tools, code_calling=True) + tools
    return Executor(client, tools), client


# --------------------------------------------------------------------------- catalog

def test_catalog_names_are_valid_and_unique():
    cat = load_catalog()
    names = [e["name"] for e in cat]
    assert len(names) == len(set(names))
    assert all(re.fullmatch(r"[A-Za-z0-9_-]{1,64}", n) for n in names)


def test_catalog_excludes_admin_surfaces():
    blueprints = {e["blueprint"] for e in load_catalog()}
    assert not blueprints & {"auth", "super_admin", "account"}


def test_catalog_found_query_models_for_list_endpoints():
    by = {e["name"]: e for e in load_catalog()}
    assert by["invoice__list_invoices"]["query_model"] == "InvoiceListParams"
    assert by["customer__query_customers"]["body_model"] == "CustomerQuery"
    assert by["customer__query_customers"]["is_read"]          # read-shaped POST
    assert "granularity" in by["dashboard__revenue_over_time"]["query_args"]


def test_every_endpoint_schema_is_json_serialisable():
    for e in load_catalog():
        json.dumps(endpoint_input_schema(e))


# --------------------------------------------------------------------------- permissions

def test_admin_gets_all_reads_and_no_writes_by_default():
    tools = endpoint_tools(ADMIN)
    reads = [e for e in load_catalog() if e["is_read"]]
    assert len(tools) == len(reads)
    assert all(t.is_read for t in tools)


def test_driver_only_gets_granted_blueprints():
    names = {t.entry["blueprint"] for t in endpoint_tools(DRIVER)}
    assert names <= {"trip", "customer"}
    assert "trip" in names and "payment" not in names


def test_account_cap_binds_admins():
    names = {t.entry["blueprint"] for t in endpoint_tools(CAPPED_ADMIN)}
    assert names == {"customer"}


def test_permitted_checks_action():
    e = {"blueprint": "trip", "action": "update"}
    assert not permitted(e, DRIVER)


# --------------------------------------------------------------------------- execution

def test_executor_refuses_writes_even_if_named():
    client = FakeClient()
    write = next(e for e in load_catalog() if not e["is_read"])
    spec = ToolSpec(name=write["name"], description="", input_schema={}, is_read=False, entry=write)
    ex = Executor(client, [spec])                 # allow_writes defaults to False
    text, err = ex.run(write["name"], {})
    assert err and "turned off" in text
    assert client.calls == []


def test_executor_refuses_unknown_tool():
    ex, client = admin_executor()
    text, err = ex.run("payout__create_payout", {})
    assert err and client.calls == []


def test_path_params_are_filled_and_escaped():
    assert fill_path("/customer/<string:uuid>", {"uuid": "a/b"}) == "/customer/a%2Fb"
    with pytest.raises(ValueError):
        fill_path("/customer/<string:uuid>", {})


def test_results_are_trimmed_and_truncated():
    assert "geometry" not in to_text({"geometry": "x", "a": 1})
    assert "truncated" in to_text({"rows": ["x" * 100] * 1000})


# --------------------------------------------------------------------------- query_data

def test_fetch_all_pages_through_every_page_as_user():
    ex, client = admin_executor()
    rows = qd.fetch_all(ex, "invoice__list_invoices", {"status": "pending"})
    assert len(rows) == 250
    assert [c[2]["page"] for c in client.calls] == [1, 2, 3]
    assert all(c[2]["per_page"] == 100 and c[2]["status"] == "pending" for c in client.calls)


def test_fetch_all_rejects_non_list_endpoints():
    ex, _ = admin_executor()
    with pytest.raises(ValueError):
        qd.fetch_all(ex, "customer__get_customer", {})


def test_query_data_group_sum_sort_limit():
    ex, _ = admin_executor()
    out = qd.run(ex, {
        "endpoint": "invoice__list_invoices",
        "where": [{"field": "is_overdue", "op": "eq", "value": True}, {"field": "currency", "op": "eq", "value": "USD"}],
        "group_by": ["customer_uuid"],
        "aggregates": [{"op": "sum", "field": "net_amount_due", "as": "due"}, {"op": "count"}],
        "sort": [{"field": "due", "desc": True}],
        "limit": 3,
    })
    expected = {}
    for i in range(250):
        if i % 3 == 0 and i % 2 == 1:
            expected[f"c{i % 7}"] = expected.get(f"c{i % 7}", 0) + i
    top = sorted(expected.items(), key=lambda kv: -kv[1])[:3]
    assert [(r["customer_uuid"], r["due"]) for r in out["result"]] == top
    assert out["rows_fetched"] == 250


def test_query_data_relative_dates_and_projection():
    ex, _ = admin_executor()
    out = qd.run(ex, {"endpoint": "invoice__list_invoices",
                      "where": [{"field": "created_at", "op": "gte", "value": "2026-11-28"}],
                      "fields": ["uuid", "created_at"], "limit": 500})
    assert out["result"] and all(set(r) == {"uuid", "created_at"} for r in out["result"])
    assert qd._relative_date("now-30d") != "now-30d"


def test_sort_puts_missing_values_last_both_directions():
    rows = [{"a": 2}, {"a": None}, {"a": 5}]
    assert [r["a"] for r in qd.sort_rows(list(rows), [{"field": "a", "desc": True}])] == [5, 2, None]
    assert [r["a"] for r in qd.sort_rows(list(rows), [{"field": "a"}])] == [2, 5, None]


def test_ungrouped_aggregate_over_no_rows_is_zero():
    out = qd.aggregate([], [], [{"op": "count"}, {"op": "sum", "field": "x", "as": "s"}])
    assert out == [{"count": 0, "s": 0.0}]
    assert qd.aggregate([], ["g"], [{"op": "count"}]) == []


def test_grader_numbers_names_and_arabic_digits():
    from assistant.eval.cases import Expect
    from assistant.eval.run import grade, numbers_in
    assert numbers_in("المجموع ١٬٢٣٤٫٥ ل.س and 3,906.50 USD") == [1234.5, 3906.5]
    ok, misses = grade("Top: Abu hamza distributer owes $622", Expect(numbers=[622.0001], names=["abu  HAMZA distributer"]))
    assert ok, misses
    ok, misses = grade("about 600", Expect(numbers=[622]))
    assert not ok


def test_matches_contains_on_tag_lists():
    row = {"tags": ["customer_sale:repeated_sale"]}
    assert qd.matches(row, {"field": "tags", "op": "contains", "value": "customer_sale:repeated_sale"})


# --------------------------------------------------------------------------- agent loop

class FakeProvider:
    """Scripted model: each entry is a list of ToolCalls or a final text."""

    def __init__(self, script):
        self.script = list(script)
        self.spec = MODELS["anthropic:claude-opus-5-5"]
        self.effort = "medium"
        self.seen_tools = None

    def user_message(self, text):
        return {"role": "user", "content": text}

    def tool_results_message(self, outcomes):
        return {"role": "user", "content": [(o.call.name, o.is_error, o.text[:80]) for o in outcomes]}

    def system_message(self, text):
        return {"role": "system", "content": text}

    def run_turn(self, system, messages, tools, callbacks):
        self.seen_system = system
        self.seen_efforts = getattr(self, "seen_efforts", []) + [self.effort]
        self.seen_tools = tools
        step = self.script.pop(0)
        usage = {"input_tokens": 1000, "output_tokens": 100}
        if step == "REFUSE":
            return ProviderTurn({"role": "assistant", "content": ""}, [], "", "refusal", usage, refusal="no")
        if isinstance(step, str):
            return ProviderTurn({"role": "assistant", "content": step}, [], step, "end_turn", usage)
        return ProviderTurn({"role": "assistant", "content": "calls"}, step, "", "tool_use", usage)


def make_convo(monkeypatch, script, me=ADMIN):
    fake = FakeProvider(script)
    monkeypatch.setattr("assistant.agent.make_provider", lambda spec, **kw: fake)
    convo = Conversation(client=FakeClient(me), spec=MODELS["anthropic:claude-opus-5-5"])
    return convo, fake


def test_agent_runs_tools_then_answers(monkeypatch):
    convo, fake = make_convo(monkeypatch, [
        [ToolCall("t1", "query_data", {"endpoint": "invoice__list_invoices", "aggregates": [{"op": "count"}]})],
        "There are 250 invoices.",
    ])
    r = convo.ask("how many invoices?")
    assert r.text == "There are 250 invoices."
    assert r.model_calls == 2 and r.tool_calls[0]["tool"] == "query_data" and not r.tool_calls[0]["error"]
    assert r.cost_usd == pytest.approx(cost_usd(fake.spec, {"input_tokens": 2000, "output_tokens": 200}))
    assert convo.client.conversation_id == convo.id


def test_agent_write_without_a_way_to_confirm_is_declined(monkeypatch):
    # Conversation's default confirm callback denies: no UI => no writes
    convo, _ = make_convo(monkeypatch, [[ToolCall("t1", "customer__delete_customer", {"uuid": "c1"})], "OK, not deleted."])
    r = convo.ask("delete it")
    assert r.tool_calls[0]["error"] and r.text == "OK, not deleted."
    assert all(c[0] == "GET" for c in convo.client.calls)


def test_agent_handles_refusal(monkeypatch):
    convo, _ = make_convo(monkeypatch, ["REFUSE"])
    assert convo.ask("?").stop_reason == "refusal"


def test_driver_conversation_gets_only_their_tools(monkeypatch):
    convo, fake = make_convo(monkeypatch, ["ok"], me=DRIVER)
    convo.ask("hi")
    bps = {t.entry["blueprint"] for t in fake.seen_tools if t.entry}
    assert bps <= {"trip", "customer"}


# --------------------------------------------------------------------------- anthropic rendering

def test_anthropic_tool_rendering(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-used")
    from assistant.providers.anthropic_provider import AnthropicProvider

    endpoints = endpoint_tools(ADMIN)
    tools = harness_tools(endpoints, code_calling=True) + endpoints
    p = AnthropicProvider(MODELS["anthropic:claude-opus-5-5"], code_calling=True)
    rendered = p.render_tools(tools)
    assert rendered[0]["type"].startswith("tool_search_tool_bm25")
    assert any(t.get("type", "").startswith("code_execution") for t in rendered)
    by = {t.get("name"): t for t in rendered}
    assert by["fetch_all"]["allowed_callers"] == ["code_execution_20260120"]
    assert "defer_loading" not in by["query_data"]
    assert by["invoice__list_invoices"]["defer_loading"] is True

    p2 = AnthropicProvider(MODELS["anthropic:claude-opus-5-5"], code_calling=False)
    names = {t.get("name") for t in p2.render_tools(harness_tools(endpoints, code_calling=False) + endpoints)}
    assert "fetch_all" not in names and "code_execution" not in names


# --------------------------------------------------------------------------- actions

from assistant.actions import STRONG, WRITE, describe, risk, NameResolver  # noqa: E402


def _entry(name):
    return next(e for e in load_catalog() if e["name"] == name)


def write_executor(confirm):
    client = FakeClient()
    client.conversation_id = "conv1"
    tools = endpoint_tools(ADMIN, include_writes=True)
    return Executor(client, tools, allow_writes=True, confirm=confirm), client


ORDER = {"body": {"customer_uuid": "cust-1", "currency": "USD", "due_date": None,
                  "items": [{"material_uuid": "mat-1", "quantity": 10, "price_per_unit": 32}]}}


def test_risk_tiers():
    assert risk(_entry("customer__create_customer")) == WRITE
    assert risk(_entry("customer__delete_customer")) == STRONG
    assert risk(_entry("payment__create_payment")) == STRONG
    assert risk(_entry("customer_order__create_customer_order_checkout")) == STRONG
    assert risk(_entry("customer_order_item__fulfill_order_items")) == STRONG
    assert risk(_entry("workflow_execution__resort_stops")) == WRITE
    assert risk(_entry("invoice__list_invoices")) == "read"


def test_write_schemas_never_expose_created_by():
    for t in endpoint_tools(ADMIN, include_writes=True):
        assert "created_by_uuid" not in json.dumps(t.input_schema)


def test_location_writes_are_never_offered():
    assert not [t for t in endpoint_tools(ADMIN, include_writes=True)
                if t.entry["blueprint"] == "location" and not t.is_read]


def test_declined_write_sends_nothing():
    seen = []
    ex, client = write_executor(lambda req: seen.append(req) or False)
    text, err = ex.run("customer_order__create_customer_order_with_items_and_invoice", ORDER, call_id="tu1")
    assert err and "DECLINED" in text
    assert seen and all(c[0] == "GET" for c in client.calls)   # only name lookups


def test_approved_write_is_sent_once_with_idempotency_key_and_no_impersonation():
    ex, client = write_executor(lambda req: True)
    args = {"body": dict(ORDER["body"], created_by_uuid="someone-else")}
    # created_by_uuid is stripped before validation, so it is never sent
    text, err = ex.run("customer_order__create_customer_order_with_items_and_invoice", args, call_id="tu3")
    assert not err and "Done" in text
    posts = [(c, k) for c, k in zip(client.calls, client.keys) if c[0] == "POST"]
    assert len(posts) == 1
    (method, path, _, body), key = posts[0]
    assert path == "/customer-order/with-items-and-invoice" and key == "assistant-conv1-tu3"
    assert "created_by_uuid" not in json.dumps(body)


def test_invalid_write_is_rejected_before_asking_the_user():
    asked = []
    ex, client = write_executor(lambda req: asked.append(req) or True)
    bad = {"body": {"customer_uuid": "c", "currency": "EUR", "items": []}}
    text, err = ex.run("customer_order__create_customer_order_with_items_and_invoice", bad, call_id="x")
    assert err and "Not sent" in text and "currency" in text
    assert asked == [] and not [c for c in client.calls if c[0] != "GET"]


def test_unknown_fields_are_rejected_before_asking_the_user():
    asked = []
    ex, client = write_executor(lambda req: asked.append(req) or True)
    text, err = ex.run("customer__update_customer", {"uuid": "c1", "body": {"balance": 0}}, call_id="x")
    assert err and "Not sent" in text and asked == []


def test_programmatic_writes_are_refused():
    ex, client = write_executor(lambda req: True)
    text, err = ex.run("customer__delete_customer", {"uuid": "c1"}, call_id="p1", programmatic=True)
    assert err and "cannot be made from code" in text and client.calls == []


def test_confirmation_shows_names_items_and_total():
    req = describe(_entry("customer_order__create_customer_order_with_items_and_invoice"), ORDER,
                   NameResolver(FakeClient(), load_catalog()))
    text = req.render()
    assert "Al-Noor (cust-1)" in text
    assert "10 × Sugar 50kg (mat-1) @ 32 = 320" in text
    assert "TOTAL: 320 USD" in text


def test_unnamed_records_are_described_by_customer_money_and_status():
    class C(FakeClient):
        def request(self, method, path, params=None, body=None, idempotency_key=None):
            if path.startswith("/invoice/"):
                return {"uuid": "inv-1", "customer_uuid": "cust-1", "currency": "SYP", "net_amount_due": 2.0,
                        "status": "pending", "created_at": "2026-11-11T20:32:41Z"}
            return super().request(method, path, params, body, idempotency_key)

    r = NameResolver(C(), load_catalog())
    assert r.name("invoice_uuid", "inv-1") == "invoice for Al-Noor, due 2 SYP, pending, 2026-11-11 (inv-1)"


def test_update_confirmation_is_a_diff_against_the_current_record():
    req = describe(_entry("customer__update_customer"),
                   {"uuid": "c9", "body": {"phone_number": "0999", "category": "minimarket"}},
                   NameResolver(FakeClient(), load_catalog()))
    assert req.target == "Al-Noor (c9)"
    assert req.lines == ["phone number: 0911 → 0999"]   # unchanged category is not shown
