"""The assistant's tables, in Karma's Postgres (SQLite for tests and quick local runs).

The schema is owned by the API's Alembic migrations (models/common.py,
migration a7e4c2b9d1f3); these Core definitions mirror it so the service does
not import the API's models and their dependencies. Keep the two in step.

    ASSISTANT_DATABASE_URL   postgresql://user:pass@host:5432/db   (production)
                             unset -> SQLite at ASSISTANT_DB or assistant/data/
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import (JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, MetaData, String,
                        Table, Text, create_engine)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine

DEFAULT_SQLITE = Path(__file__).with_name("data") / "assistant.sqlite3"

JSONType = JSON().with_variant(JSONB(), "postgresql")
metadata = MetaData()

# Only the columns the service touches; the real tables have FKs to user/account.
platform_setting = Table(
    "platform_setting", metadata,
    Column("key", String(64), primary_key=True),
    Column("value", JSONType, nullable=True),
    Column("updated_at", DateTime),
)

conversation = Table(
    "assistant_conversation", metadata,
    Column("owner_key", String(80), primary_key=True),
    Column("user_uuid", String(36), nullable=False),
    Column("account_uuid", String(36), nullable=True),
    Column("conv_id", String(64), nullable=False),
    Column("model_id", String(80), nullable=False),
    Column("messages", JSONType, nullable=False),
    Column("transcript", JSONType, nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

usage = Table(
    "assistant_usage", metadata,
    Column("uuid", String(36), primary_key=True),
    Column("account_uuid", String(36), nullable=True),
    Column("user_uuid", String(36), nullable=False),
    Column("conv_id", String(64), nullable=False),
    Column("model_id", String(80), nullable=False),
    Column("outcome", String(16), nullable=False),
    Column("cost_usd", Float, nullable=False),
    Column("input_tokens", Integer, nullable=False),
    Column("output_tokens", Integer, nullable=False),
    Column("cache_read_tokens", Integer, nullable=False),
    Column("cache_write_tokens", Integer, nullable=False),
    Column("seconds", Float, nullable=False),
    Column("model_calls", Integer, nullable=False),
    Column("tool_calls", Integer, nullable=False),
    Column("voice", Boolean, nullable=False),
    Column("created_at", DateTime, nullable=False),
    Index("ix_assistant_usage_account_created", "account_uuid", "created_at"),
    Index("ix_assistant_usage_user_created", "user_uuid", "created_at"),
)

action = Table(
    "assistant_action", metadata,
    Column("uuid", String(36), primary_key=True),
    Column("account_uuid", String(36), nullable=True),
    Column("user_uuid", String(36), nullable=False),
    Column("conv_id", String(64), nullable=False),
    Column("tier", String(16), nullable=False),
    Column("method", String(8), nullable=False),
    Column("path", String(255), nullable=False),
    Column("title", String(255), nullable=False),
    Column("summary", JSONType, nullable=True),
    Column("body", JSONType, nullable=True),
    Column("decision", String(16), nullable=False),
    Column("status_code", Integer, nullable=True),
    Column("error", Text, nullable=True),
    Column("created_at", DateTime, nullable=False),
)

account_setting = Table(
    "assistant_account_setting", metadata,
    Column("account_uuid", String(36), primary_key=True),
    Column("enabled", Boolean, nullable=True),
    Column("monthly_budget_usd", Float, nullable=True),
    Column("updated_at", DateTime, nullable=False),
)


def database_url() -> str:
    url = os.environ.get("ASSISTANT_DATABASE_URL", "").strip()
    if url:
        # psycopg 3 driver; the API's URIs are written as plain postgresql://
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url
    path = os.environ.get("ASSISTANT_DB") or str(DEFAULT_SQLITE)
    if path == ":memory:":
        return "sqlite+pysqlite:///:memory:"
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite+pysqlite:///{path}"


def make_engine(url: str | None = None) -> Engine:
    url = url or database_url()
    if url.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool
        kw = {"poolclass": StaticPool} if url.endswith(":memory:") else {}   # one shared in-memory DB
        engine = create_engine(url, connect_args={"check_same_thread": False}, **kw)
        # SQLite is for tests and local runs only: no migrations there
        metadata.create_all(engine)
        return engine
    # Postgres: tables come from the API's Alembic migrations. Bound every
    # statement so a stuck query can't hold a chat turn (or a pool slot) forever.
    return create_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True, pool_recycle=1800,
                         connect_args={"options": "-c statement_timeout=10000 -c lock_timeout=5000"})


def describe(engine: Engine) -> str:
    u = engine.url
    return f"{u.get_backend_name()} {u.host or ''}{('/' + u.database) if u.database else ''}"
