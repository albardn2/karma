"""Server rules that must hold regardless of the model. No network, no model."""
from __future__ import annotations

import json

import pytest
from starlette.testclient import TestClient

from assistant import server
from assistant.actions import ConfirmRequest
from assistant.agent import TurnResult
from assistant.store import Store, Transcript, owner_key

USERS = {
    "tok-a": {"uuid": "user-a", "username": "a", "account_uuid": "acct-1"},
    "tok-b": {"uuid": "user-b", "username": "b", "account_uuid": "acct-1"},
    # the platform owner, once normally and once impersonating another company
    "tok-s": {"uuid": "super", "username": "s", "account_uuid": "acct-0"},
    "tok-s-imp": {"uuid": "super", "username": "s", "account_uuid": "acct-0", "impersonating_account_uuid": "acct-9"},
}
A = {"Authorization": "Bearer tok-a"}
B = {"Authorization": "Bearer tok-b"}


class FakeConversation:
    """Stands in for agent.Conversation: answers with text and a chart."""
    instances: list = []

    def __init__(self, client, spec, allow_writes, confirm, id=None, messages=None):
        self.client, self.confirm = client, confirm
        self.id = id or f"conv-{len(FakeConversation.instances)}"
        self.messages = messages if messages is not None else []
        FakeConversation.instances.append(self)
        self.fail = False

    def ask(self, text, cb, voice=False):
        self.last_voice = voice
        self.messages.append({"role": "user", "content": text})
        if self.fail:
            self.messages.append({"role": "assistant", "content": "half-finished tool call"})
            raise RuntimeError("boom")
        cb.on_status("calling query_data")
        cb.on_text("Here you go.")
        cb.on_chart({"title": "T", "type": "bar", "labels": ["a"], "series": [{"name": "s", "values": [1]}],
                     "source": {"kind": "model"}, "truncated": False})
        answer = f"Answer to: {text} (I remember {len(self.messages) // 2} earlier turns)"
        self.messages.append({"role": "assistant", "content": answer})
        return TurnResult(text=answer, stop_reason="end_turn", model_calls=1, tool_calls=[], usage={},
                          cost_usd=0.01, seconds=0.1)


class FakeClient:
    def __init__(self, token):
        self.token = token


@pytest.fixture
def client(monkeypatch):
    def fake_who(token):
        if token not in USERS:
            raise server.KarmaError(401, "bad token")
        return FakeClient(token), USERS[token]

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-not-used")
    monkeypatch.setattr(server, "_who", fake_who)
    monkeypatch.setattr(server, "Conversation", FakeConversation)
    monkeypatch.setattr(server, "STORE", Store(":memory:"))
    FakeConversation.instances.clear()
    server.LIVE.clear()
    return TestClient(server.app)


def ask(c, text, headers=A, voice=False):
    events = []
    body = {"text": text, **({"voice": True} if voice else {})}
    with c.stream("POST", "/assistant/conversation/messages", json=body, headers=headers) as r:
        assert r.status_code == 200, r.read()
        for line in r.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


def restart_service():
    """Forget every live object, as a restart would. The store survives."""
    server.LIVE.clear()


# --------------------------------------------------------------------------- auth & isolation

def test_requests_without_a_valid_token_are_refused(client):
    assert client.get("/assistant/conversation").status_code == 401
    assert client.get("/assistant/conversation", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_history_is_per_user(client):
    ask(client, "hello from a")
    assert client.get("/assistant/conversation", headers=B).json()["items"] == []
    items = client.get("/assistant/conversation", headers=A).json()["items"]
    assert items[0] == {"kind": "user", "text": "hello from a"}


def test_history_is_separate_per_company_for_the_platform_owner(client):
    ask(client, "in my own company", headers={"Authorization": "Bearer tok-s"})
    imp = client.get("/assistant/conversation", headers={"Authorization": "Bearer tok-s-imp"}).json()
    assert imp["items"] == []
    assert owner_key(USERS["tok-s"]) != owner_key(USERS["tok-s-imp"])


def test_another_user_cannot_answer_my_confirmation(client):
    live = server.Live(key=owner_key(USERS["tok-a"]), me=USERS["tok-a"])
    p = server.Pending(request=ConfirmRequest(tier="write", title="x", method="POST", path="/x"))
    live.pending["c1"] = p
    server.LIVE[live.key] = live
    r = client.post("/assistant/conversation/confirm", json={"confirm_id": "c1", "approved": True}, headers=B)
    assert r.status_code == 404 and not p.event.is_set()


@pytest.mark.parametrize("tier,body,status,approved", [
    ("strong", {"approved": True}, 400, None),
    ("strong", {"approved": True, "confirm_text": "CONFIRM"}, 200, True),
    ("strong", {"approved": False}, 200, False),
    ("write", {"approved": True}, 200, True),
])
def test_confirmation_rules(client, tier, body, status, approved):
    live = server.Live(key=owner_key(USERS["tok-a"]), me=USERS["tok-a"])
    p = server.Pending(request=ConfirmRequest(tier=tier, title="x", method="DELETE", path="/x"))
    live.pending["c1"] = p
    server.LIVE[live.key] = live
    r = client.post("/assistant/conversation/confirm", json={"confirm_id": "c1", **body}, headers=A)
    assert r.status_code == status
    assert p.event.is_set() == (approved is not None)
    if approved is not None:
        assert p.approved is approved


# --------------------------------------------------------------------------- persistence

def test_history_survives_reload_and_service_restart(client):
    ev = ask(client, "first question")
    assert [e["type"] for e in ev] == ["status", "text", "chart", "done"]
    restart_service()
    got = client.get("/assistant/conversation", headers=A).json()
    assert got["busy"] is False and got["model"]["label"]
    kinds = [i["kind"] for i in got["items"]]
    assert kinds == ["user", "assistant"]
    bubble = got["items"][1]
    assert bubble["text"].startswith("Answer to: first question") and bubble["charts"][0]["title"] == "T"
    assert bubble["meta"]["cost_usd"] == 0.01

    # the model's memory is restored too: the rebuilt conversation sees the earlier turn
    ask(client, "second question")
    rebuilt = FakeConversation.instances[-1]
    assert rebuilt is not FakeConversation.instances[0]          # a new object after the restart…
    assert rebuilt.id == FakeConversation.instances[0].id        # …for the same conversation
    assert [m["content"] for m in rebuilt.messages][:2] == [
        "first question", FakeConversation.instances[0].messages[1]["content"]]
    assert len(rebuilt.messages) == 4


def test_clear_deletes_history(client):
    ask(client, "something")
    assert client.delete("/assistant/conversation", headers=A).json() == {"ok": True}
    assert client.get("/assistant/conversation", headers=A).json()["items"] == []
    restart_service()
    assert client.get("/assistant/conversation", headers=A).json()["items"] == []


def test_clear_is_refused_while_working(client):
    live = server.Live(key=owner_key(USERS["tok-a"]), me=USERS["tok-a"])
    live.busy.acquire()
    server.LIVE[live.key] = live
    assert client.delete("/assistant/conversation", headers=A).status_code == 409
    assert client.get("/assistant/conversation", headers=A).json()["busy"] is True


def test_failed_turn_is_shown_but_forgotten_by_the_model(client):
    ask(client, "ok question")
    FakeConversation.instances[-1].fail = True
    ev = ask(client, "breaks")
    assert ev[-1]["type"] == "error"
    convo = FakeConversation.instances[-1]
    assert [m["content"] for m in convo.messages][-1].startswith("Answer to: ok question")
    items = client.get("/assistant/conversation", headers=A).json()["items"]
    assert [i["kind"] for i in items] == ["user", "assistant", "user", "error"]


def test_voice_flag_reaches_the_agent_and_marks_the_transcript(client):
    ask(client, "typed question")
    ask(client, "spoken question", voice=True)
    assert FakeConversation.instances[-1].last_voice is True
    users = [i for i in client.get("/assistant/conversation", headers=A).json()["items"] if i["kind"] == "user"]
    assert users == [{"kind": "user", "text": "typed question"},
                     {"kind": "user", "text": "spoken question", "voice": True}]


# --------------------------------------------------------------------------- transcript builder

def test_transcript_splits_around_confirmations_and_closes_them():
    t = Transcript()
    t.user("do it")
    t.event({"type": "status", "text": "searching tools"})
    t.event({"type": "text", "delta": "Creating it."})
    t.event({"type": "confirm", "confirm_id": "c1", "tier": "write", "title": "Create customer", "lines": []})
    t.event({"type": "confirm_resolved", "confirm_id": "c1", "approved": True})
    t.event({"type": "text", "delta": "draft"})
    t.event({"type": "done", "text": "Done!", "cost_usd": 0.02, "seconds": 3})
    t.event({"type": "confirm", "confirm_id": "c2", "tier": "strong", "title": "Delete", "lines": []})
    t.finish()
    kinds = [(i["kind"], i.get("text") or i.get("state")) for i in t.items]
    assert kinds == [("user", "do it"), ("assistant", "Creating it."), ("confirm", "approved"),
                     ("assistant", "Done!"), ("confirm", "cancelled")]
