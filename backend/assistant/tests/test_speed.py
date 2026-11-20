"""Speed features: parallel page fetching and the per-conversation list cache. No network."""
from __future__ import annotations

import threading
import time

from assistant import joins
from assistant import query_data as qd
from assistant.tests.test_assistant import ADMIN, FakeClient, admin_executor, write_executor


def test_pages_are_fetched_concurrently_and_in_order():
    ex, client = admin_executor()
    seen_threads = set()
    orig = client.request

    def slow(method, path, params=None, body=None, idempotency_key=None):
        seen_threads.add(threading.get_ident())
        time.sleep(0.05)
        return orig(method, path, params, body, idempotency_key)

    client.request = slow
    t = time.monotonic()
    rows = qd.fetch_all(ex, "invoice__list_invoices", {}, )
    # 250 rows = 3 pages: page 1, then 2 and 3 together (≈ 2 round trips, not 3)
    assert [r["uuid"] for r in rows] == [f"i{i}" for i in range(250)]
    assert time.monotonic() - t < 0.14
    assert len(seen_threads) >= 2


def test_max_rows_limits_the_pages_requested():
    ex, client = admin_executor()
    qd.fetch_all(ex, "invoice__list_invoices", {}, max_rows=150)
    pages = sorted(c[2]["page"] for c in client.calls if c[1] == "/invoice/")
    assert pages == [1, 2]


def test_list_cache_reuses_within_a_conversation_and_clears_on_write():
    ex, client = write_executor(lambda req: True)
    count = lambda: sum(1 for c in client.calls if c[1] == "/invoice/")
    joins.load(ex, "invoice__list_invoices")
    first = count()
    joins.load(ex, "invoice__list_invoices")
    qd.run(ex, {"endpoint": "invoice__list_invoices", "aggregates": [{"op": "count"}]})
    assert count() == first                       # served from the cache
    ex.run("customer__update_customer", {"uuid": "c1", "body": {"phone_number": "1"}}, call_id="w1")
    joins.load(ex, "invoice__list_invoices")
    assert count() == 2 * first                   # a write empties the cache


def test_list_cache_expires(monkeypatch):
    ex, client = admin_executor()
    joins.load(ex, "invoice__list_invoices")
    n = len(client.calls)
    monkeypatch.setattr(joins, "LIST_CACHE_TTL_S", 0)
    joins.load(ex, "invoice__list_invoices")
    assert len(client.calls) > n
