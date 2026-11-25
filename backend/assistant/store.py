"""The assistant's storage: conversations, usage, the action log, and settings.

One conversation per user per company, kept until the user clears it:
  - messages:   the model's history (provider wire format, pinned to model_id),
                so the assistant remembers the conversation after a restart;
  - transcript: what the chat panel shows (user messages, answers with charts,
                confirmation cards with their outcome, errors).

Tables live in Karma's Postgres (see db.py); everything here is safe to call
from several service instances at once.
"""
from __future__ import annotations

import json
import time
import uuid as uuidlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.engine import Engine

from billing_cycle import billing_anchor_of

from . import db


def account_of(me: dict) -> str | None:
    return me.get("impersonating_account_uuid") or me.get("account_uuid")


def owner_key(me: dict) -> str:
    """A user's history is separate per company: a platform owner impersonating a
    tenant must not see (or carry) one tenant's conversation into another."""
    return f"{me['uuid']}:{account_of(me) or '-'}"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)   # naive UTC, like the API's columns


def _ts(d: datetime | None) -> float:
    return d.replace(tzinfo=timezone.utc).timestamp() if d else time.time()


def _naive(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, timezone.utc).replace(tzinfo=None)


def _json_safe(v):
    """JSON columns reject what json.dumps(default=str) absorbs (dates, decimals)."""
    return json.loads(json.dumps(v, ensure_ascii=False, default=str))


def hour_ago(now: datetime | None = None) -> datetime:
    return (now or _now()) - timedelta(hours=1)


@dataclass
class Stored:
    owner_key: str
    user_uuid: str
    account_uuid: str | None
    conv_id: str
    model_id: str
    messages: list = field(default_factory=list)
    transcript: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


class Store:
    def __init__(self, engine: Engine | str | None = None):
        if isinstance(engine, str):    # a SQLite path or ':memory:' (tests, local runs)
            engine = db.make_engine("sqlite+pysqlite:///:memory:" if engine == ":memory:"
                                    else f"sqlite+pysqlite:///{engine}")
        self.engine = engine or db.make_engine()

    def describe(self) -> str:
        return db.describe(self.engine)

    # ------------------------------------------------------------ conversations

    def get(self, key: str) -> Stored | None:
        t = db.conversation
        with self.engine.connect() as c:
            r = c.execute(select(t).where(t.c.owner_key == key)).mappings().first()
        if not r:
            return None
        return Stored(r["owner_key"], r["user_uuid"], r["account_uuid"], r["conv_id"], r["model_id"],
                      list(r["messages"] or []), list(r["transcript"] or []),
                      _ts(r["created_at"]), _ts(r["updated_at"]))

    def save(self, s: Stored) -> None:
        t = db.conversation
        now = _now()
        s.updated_at = _ts(now)
        values = dict(conv_id=s.conv_id, model_id=s.model_id, messages=_json_safe(s.messages),
                      transcript=_json_safe(s.transcript), updated_at=now)
        with self.engine.begin() as c:
            done = c.execute(t.update().where(t.c.owner_key == s.owner_key).values(**values)).rowcount
            if not done:
                c.execute(t.insert().values(owner_key=s.owner_key, user_uuid=s.user_uuid,
                                            account_uuid=s.account_uuid, created_at=_naive(s.created_at),
                                            **values))

    def delete(self, key: str) -> None:
        t = db.conversation
        with self.engine.begin() as c:
            c.execute(t.delete().where(t.c.owner_key == key))

    # ------------------------------------------------------------ usage & audit

    def record_usage(self, *, me: dict, conv_id: str, model_id: str, outcome: str, cost_usd: float = 0.0,
                     usage: dict | None = None, seconds: float = 0.0, model_calls: int = 0,
                     tool_calls: int = 0, voice: bool = False) -> None:
        u = usage or {}
        with self.engine.begin() as c:
            c.execute(db.usage.insert().values(
                uuid=str(uuidlib.uuid4()), account_uuid=account_of(me), user_uuid=me["uuid"], conv_id=conv_id,
                model_id=model_id, outcome=outcome, cost_usd=float(cost_usd or 0),
                input_tokens=int(u.get("input_tokens", 0)), output_tokens=int(u.get("output_tokens", 0)),
                cache_read_tokens=int(u.get("cache_read_input_tokens", 0)),
                cache_write_tokens=int(u.get("cache_creation_input_tokens", 0)),
                seconds=float(seconds or 0), model_calls=int(model_calls), tool_calls=int(tool_calls),
                voice=bool(voice), created_at=_now()))

    def record_action(self, *, me: dict, conv_id: str, record: dict) -> None:
        with self.engine.begin() as c:
            c.execute(db.action.insert().values(
                uuid=str(uuidlib.uuid4()), account_uuid=account_of(me), user_uuid=me["uuid"], conv_id=conv_id,
                tier=str(record.get("tier") or "write")[:16], method=str(record.get("method") or "")[:8],
                path=str(record.get("path") or "")[:255], title=str(record.get("title") or "")[:255],
                summary=_json_safe(record.get("summary")), body=_json_safe(record.get("body")),
                decision=record.get("decision") or "declined", status_code=record.get("status_code"),
                error=record.get("error"), created_at=_now()))

    def account_spend_since(self, account_uuid: str | None, since: datetime) -> float:
        t = db.usage
        q = select(func.coalesce(func.sum(t.c.cost_usd), 0.0)).where(t.c.created_at >= since)
        q = q.where(t.c.account_uuid.is_(None) if account_uuid is None else t.c.account_uuid == account_uuid)
        with self.engine.connect() as c:
            return float(c.execute(q).scalar() or 0.0)

    def user_messages_since(self, user_uuid: str, since: datetime) -> int:
        t = db.usage
        with self.engine.connect() as c:
            return int(c.execute(select(func.count()).select_from(t)
                                 .where(t.c.user_uuid == user_uuid, t.c.created_at >= since)).scalar() or 0)

    # ------------------------------------------------------------ settings

    def platform_settings(self) -> dict:
        t = db.platform_setting
        with self.engine.connect() as c:
            v = c.execute(select(t.c.value).where(t.c.key == "assistant")).scalar()
        return dict(v or {})

    def account_settings(self, account_uuid: str | None) -> dict:
        if not account_uuid:
            return {}
        t = db.account_setting
        with self.engine.connect() as c:
            r = c.execute(select(t.c.enabled, t.c.plan_price_usd, t.c.margin_pct, t.c.user_messages_per_hour)
                          .where(t.c.account_uuid == account_uuid)).mappings().first()
        return dict(r) if r else {}

    def account_anchor(self, account_uuid: str | None) -> date | None:
        """The day the company's billing grid starts, or None for an unknown company."""
        if not account_uuid:
            return None
        t = db.account
        with self.engine.connect() as c:
            r = c.execute(select(t.c.verified_at, t.c.created_at)
                          .where(t.c.uuid == account_uuid)).first()
        return billing_anchor_of(r.verified_at, r.created_at) if r else None


# What a user may see about an answer. Its cost is not among them: users see how
# much of the plan's allowance is used, never what the model cost.
USER_META_KEYS = ("seconds", "model_calls", "tool_calls", "stop_reason")


def for_user(items: list) -> list:
    """A stored transcript as its user may see it."""
    return [{**it, "meta": {k: v for k, v in it["meta"].items() if k in USER_META_KEYS}}
            if it.get("kind") == "assistant" and it.get("meta") else it
            for it in items]


class Transcript:
    """Builds the chat panel's view from the same events the browser receives,
    so a reloaded panel looks exactly like the live one did."""

    def __init__(self, items: list | None = None):
        self.items: list[dict] = items if items is not None else []
        self._current: dict | None = None
        self._break = False

    def _bubble(self) -> dict:
        if self._current is None:
            self._current = {"kind": "assistant", "text": "", "charts": [], "meta": None}
            self.items.append(self._current)
        return self._current

    def user(self, text: str, voice: bool = False):
        self._current = None
        self.items.append({"kind": "user", "text": text, **({"voice": True} if voice else {})})

    def event(self, e: dict):
        t = e.get("type")
        if t == "status":
            self._break = True
        elif t == "text":
            b = self._bubble()
            if self._break and b["text"] and not b["text"].endswith("\n"):
                b["text"] += "\n\n"
            self._break = False
            b["text"] += e["delta"]
        elif t == "chart":
            self._bubble()["charts"].append(e["spec"])
        elif t == "confirm":
            self._drop_empty_current()
            self._current = None
            self.items.append({"kind": "confirm", "state": "pending",
                               "event": {k: v for k, v in e.items() if k != "type"}})
        elif t == "confirm_resolved":
            for it in self.items:
                if it["kind"] == "confirm" and it["event"].get("confirm_id") == e["confirm_id"]:
                    it["state"] = "approved" if e["approved"] else "cancelled"
        elif t == "done":
            b = self._bubble()
            b["text"] = e.get("text") or b["text"]
            b["meta"] = {k: e.get(k) for k in USER_META_KEYS}
        elif t == "error":
            self.items.append({"kind": "error", "text": e.get("message", "Error")})

    def finish(self):
        self._drop_empty_current()
        self._current = None
        # a confirmation can't still be pending once the turn is over
        for it in self.items:
            if it["kind"] == "confirm" and it["state"] == "pending":
                it["state"] = "cancelled"

    def _drop_empty_current(self):
        c = self._current
        if c is not None and not c["text"].strip() and not c["charts"] and not c["meta"] and c in self.items:
            self.items.remove(c)
