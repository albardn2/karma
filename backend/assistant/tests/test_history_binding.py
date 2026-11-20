"""Saved conversations must keep working across deploys and permission changes.

Claude binds its reasoning blocks to the exact system prompt + tools + earlier
messages. These tests pin the two defences: the history is append-only (the
per-user context is an appended system message, the top-level prompt never
changes), and every request asks the API to drop mismatched blocks rather than
fail.
"""
from __future__ import annotations

import pytest

from assistant import prompts
from assistant.providers.base import Callbacks
from assistant.registry import MODELS
from assistant.tests.test_assistant import ADMIN, FakeProvider, make_convo


def test_top_level_system_prompt_is_the_same_for_every_user_and_day(monkeypatch):
    convo, fake = make_convo(monkeypatch, ["hi"])
    convo.ask("hello")
    assert fake.seen_system == prompts.SYSTEM          # nothing per-user or per-time in it


def test_context_is_appended_once_and_only_again_when_it_changes(monkeypatch):
    convo, fake = make_convo(monkeypatch, ["one", "two", "three"])
    convo.ask("q1")
    convo.ask("q2")
    systems = [m for m in convo.messages if m["role"] == "system"]
    assert len(systems) == 1 and "Current user" in systems[0]["content"]
    # system message sits right after the first user message (API placement rule)
    assert convo.messages[0]["role"] == "user" and convo.messages[1]["role"] == "system"

    convo.me = dict(convo.me, permission_scope="accountant")   # role changed mid-conversation
    convo.ask("q3")
    systems = [m for m in convo.messages if m["role"] == "system"]
    assert len(systems) == 2 and "accountant" in systems[1]["content"]


def test_voice_mode_switch_is_an_appended_context_message(monkeypatch):
    convo, _ = make_convo(monkeypatch, ["a", "b", "c", "d"])
    convo.ask("typed")
    convo.ask("spoken 1", voice=True)
    convo.ask("spoken 2", voice=True)
    convo.ask("typed again")
    systems = [m["content"] for m in convo.messages if m["role"] == "system"]
    assert len(systems) == 3                                     # off, on, off — not one per turn
    assert "Voice mode is ON" in systems[1] and "Voice mode is OFF" in systems[2]
    assert "Voice mode" in prompts.SYSTEM                        # the rules live in the stable prompt


def test_voice_questions_run_at_low_effort_typed_ones_at_the_default(monkeypatch):
    convo, fake = make_convo(monkeypatch, ["a", "b", "c"])
    convo.ask("typed")
    convo.ask("spoken", voice=True)
    convo.ask("typed again")
    assert fake.seen_efforts == ["medium", "low", "medium"]


def test_earlier_messages_are_never_edited(monkeypatch):
    convo, _ = make_convo(monkeypatch, ["a", "b"])
    convo.ask("q1")
    snapshot = [dict(m) for m in convo.messages]
    convo.ask("q2")
    assert convo.messages[: len(snapshot)] == snapshot


def test_context_has_no_clock_time():
    ctx = prompts.context_block(ADMIN, "Claude", True)
    import re
    assert not re.search(r"\d{2}:\d{2}", ctx)


def test_anthropic_requests_ask_to_drop_mismatched_reasoning(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-used")
    from assistant.providers import anthropic_provider as ap

    captured = {}

    class FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def __iter__(self):
            return iter(())

        def get_final_message(self):
            class Msg:
                content = []
                usage = None
                stop_reason = "end_turn"
                container = None
            return Msg()

    p = ap.AnthropicProvider(MODELS["anthropic:claude-opus-5-5"])
    monkeypatch.setattr(p.client.beta.messages, "stream", lambda **kw: captured.update(kw) or FakeStream())
    p.run_turn("SYSTEM", [{"role": "user", "content": "hi"}], [], Callbacks())
    assert ap.BLOCK_BINDING_BETA in captured["betas"]
    assert captured["extra_body"]["thinking"] == {
        "type": "adaptive", "block_binding": {"prefix_mismatch_behavior": "drop_block"}}
    assert captured["system"] == [{"type": "text", "text": "SYSTEM", "cache_control": {"type": "ephemeral", "ttl": "1h"}}]
    # cost controls: 1-hour cache for the conversation, server-side clearing of old tool results
    assert captured["extra_body"]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert ap.CONTEXT_EDITING_BETA in captured["betas"]
    edit = captured["extra_body"]["context_management"]["edits"][0]
    assert edit["type"] == "clear_tool_uses_20250919"
    assert {"show_chart", "show_map", "tool_search_tool_bm25"} <= set(edit["exclude_tools"])


def test_cost_counts_one_hour_cache_writes_at_twice_input():
    from assistant.registry import cost_usd
    spec = MODELS["anthropic:claude-opus-5-5"]          # $4 in, $20 out, $0.20 cache read, $5 5-min write
    u = {"input_tokens": 1_000_000, "cache_read_input_tokens": 1_000_000,
         "cache_creation_input_tokens": 3_000_000, "cache_creation_1h_input_tokens": 2_000_000}
    assert cost_usd(spec, u) == pytest.approx(4 + 0.20 + 2 * 8 + 1 * 5)


def test_tool_results_are_lean():
    from assistant.tools import to_text
    out = to_text({"rows": [{"uuid": "a", "notes": None, "is_deleted": False, "tags": [], "geometry": "x" * 50}]})
    assert out == '{"rows":[{"uuid":"a","tags":[]}]}'


def test_chart_and_map_schemas_do_not_repeat_the_endpoint_list():
    from assistant.tests.test_assistant import admin_executor
    from assistant.tools import endpoint_tools, harness_tools
    tools = {t.name: t for t in harness_tools(endpoint_tools(ADMIN), False)}
    assert "enum" in tools["query_data"].input_schema["properties"]["endpoint"]
    for name in ("show_chart", "show_map"):
        assert "enum" not in tools[name].input_schema["properties"]["query"]["properties"]["endpoint"]
    ex, _ = admin_executor()
    text, err = ex.run("query_data", {"endpoint": "invoice__list_invoice"})
    assert err and "Did you mean: invoice__list_invoices" in text
