"""Per-user conversation storage (spike: SQLite owned by the assistant service).

One conversation per user per company, kept until the user clears it. Stores:
  - messages:   the model's history (provider wire format, pinned to model_id),
                so the assistant remembers the conversation after a restart;
  - transcript: what the chat panel shows (user messages, answers with charts,
                confirmation cards with their outcome, errors).

Production plan: a tenant-scoped `assistant_conversation` table in Karma's
Postgres. SQLite keeps the spike from touching the shared database schema.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PATH = Path(__file__).with_name("data") / "assistant.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversation (
    owner_key       TEXT PRIMARY KEY,      -- '<user_uuid>:<account_uuid>'
    user_uuid       TEXT NOT NULL,
    account_uuid    TEXT,
    conv_id         TEXT NOT NULL,
    model_id        TEXT NOT NULL,
    messages_json   TEXT NOT NULL,
    transcript_json TEXT NOT NULL,
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL
)
"""


def owner_key(me: dict) -> str:
    """A user's history is separate per company: a platform owner impersonating a
    tenant must not see (or carry) one tenant's conversation into another."""
    account = me.get("impersonating_account_uuid") or me.get("account_uuid") or "-"
    return f"{me['uuid']}:{account}"


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
    def __init__(self, path: str | os.PathLike | None = None):
        self.path = Path(path or os.environ.get("ASSISTANT_DB") or DEFAULT_PATH)
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(self.path), check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(SCHEMA)
        self._db.commit()

    def describe(self) -> str:
        return f"sqlite {self.path}"

    def get(self, key: str) -> Stored | None:
        with self._lock:
            row = self._db.execute(
                "SELECT owner_key, user_uuid, account_uuid, conv_id, model_id, messages_json, transcript_json,"
                " created_at, updated_at FROM conversation WHERE owner_key = ?", (key,)).fetchone()
        if not row:
            return None
        return Stored(row[0], row[1], row[2], row[3], row[4], json.loads(row[5]), json.loads(row[6]), row[7], row[8])

    def save(self, s: Stored) -> None:
        s.updated_at = time.time()
        with self._lock:
            self._db.execute(
                "INSERT INTO conversation (owner_key, user_uuid, account_uuid, conv_id, model_id, messages_json,"
                " transcript_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(owner_key) DO UPDATE SET conv_id=excluded.conv_id, model_id=excluded.model_id,"
                " messages_json=excluded.messages_json, transcript_json=excluded.transcript_json,"
                " updated_at=excluded.updated_at",
                (s.owner_key, s.user_uuid, s.account_uuid, s.conv_id, s.model_id,
                 json.dumps(s.messages, ensure_ascii=False, default=str),
                 json.dumps(s.transcript, ensure_ascii=False, default=str), s.created_at, s.updated_at))
            self._db.commit()

    def delete(self, key: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM conversation WHERE owner_key = ?", (key,))
            self._db.commit()


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
            b["meta"] = {k: e.get(k) for k in ("cost_usd", "seconds", "model_calls", "tool_calls", "stop_reason")}
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
