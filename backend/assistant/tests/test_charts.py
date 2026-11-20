"""show_chart and date buckets. No network, no model."""
from __future__ import annotations

import pytest

from assistant import charts
from assistant import query_data as qd
from assistant.tests.test_assistant import admin_executor


def test_date_buckets():
    assert qd.get_path({"d": "2026-11-20T08:00:00Z"}, "d:month") == "2026-11"
    assert qd.get_path({"d": "2026-11-20T08:00:00Z"}, "d:quarter") == "2026-Q4"
    assert qd.get_path({"d": "2026-11-20"}, "d:week") == "2026-W47"
    assert qd.get_path({"d": "2026-11-20"}, "d:year") == "2026"
    assert qd.get_path({"d": None}, "d:month") is None
    # aggregated rows carry the literal key
    assert qd.get_path({"d:month": "2026-11"}, "d:month") == "2026-11"


def test_query_chart_numbers_come_from_the_data():
    ex, client = admin_executor()
    seen = []
    ex.on_chart = seen.append
    text, err = ex.run("show_chart", {
        "title": "Due by currency", "type": "bar", "unit": "mixed",
        "query": {"endpoint": "invoice__list_invoices", "group_by": ["currency"],
                  "aggregates": [{"op": "sum", "field": "net_amount_due", "as": "due"}],
                  "sort": [{"field": "currency"}]},
        "x": "currency", "y": [{"field": "due", "label": "Amount due"}],
    })
    assert not err, text
    spec = seen[0]
    expected = {"SYP": float(sum(i for i in range(250) if i % 2 == 0)), "USD": float(sum(i for i in range(250) if i % 2))}
    assert spec["labels"] == ["SYP", "USD"]
    assert spec["series"] == [{"name": "Amount due", "values": [expected["SYP"], expected["USD"]]}]
    assert spec["source"]["kind"] == "query" and spec["source"]["rows_matched"] == 250
    assert "Chart shown to the user" in text and "SYP:" in text


def test_series_by_pivots_and_buckets_months():
    ex, _ = admin_executor()
    seen = []
    ex.on_chart = seen.append
    _, err = ex.run("show_chart", {
        "title": "Invoices per month", "type": "stacked_bar",
        "query": {"endpoint": "invoice__list_invoices", "group_by": ["created_at:month", "currency"],
                  "aggregates": [{"op": "count"}], "sort": [{"field": "created_at:month"}]},
        "x": "created_at:month", "y": [{"field": "count"}], "series_by": "currency",
    })
    assert not err
    spec = seen[0]
    assert spec["labels"] == ["2026-11"]
    assert {s["name"]: s["values"] for s in spec["series"]} == {"SYP": [125.0], "USD": [125.0]}


def test_model_supplied_data_is_validated_and_labelled():
    ex, _ = admin_executor()
    seen = []
    ex.on_chart = seen.append
    text, err = ex.run("show_chart", {"title": "x", "type": "line",
                                      "data": {"labels": ["a", "b"], "series": [{"name": "s", "values": [1]}]}})
    assert err and "1 values for 2 labels" in text and not seen
    _, err = ex.run("show_chart", {"title": "x", "type": "line",
                                   "data": {"labels": ["a", "b"], "series": [{"name": "s", "values": [1, 2]}]}})
    assert not err and seen[0]["source"] == {"kind": "model"}


@pytest.mark.parametrize("args,msg", [
    ({"title": "x", "type": "radar", "data": {"labels": ["a"], "series": [{"name": "s", "values": [1]}]}}, "type must be"),
    ({"title": "x", "type": "bar"}, "exactly one"),
    ({"title": "x", "type": "pie", "data": {"labels": ["a"], "series": [{"name": "s", "values": [1]}, {"name": "t", "values": [2]}]}}, "pie"),
])
def test_bad_chart_requests_are_rejected(args, msg):
    ex, _ = admin_executor()
    text, err = ex.run("show_chart", args)
    assert err and msg in text


def test_long_charts_are_capped():
    ex, _ = admin_executor()
    seen = []
    ex.on_chart = seen.append
    labels = [str(i) for i in range(100)]
    ex.run("show_chart", {"title": "x", "type": "bar",
                          "data": {"labels": labels, "series": [{"name": "s", "values": list(range(100))}]}})
    assert len(seen[0]["labels"]) == charts.MAX_POINTS and seen[0]["truncated"]


def test_terminal_rendering():
    spec = {"title": "T", "type": "bar", "labels": ["a", "b"], "series": [{"name": "s", "values": [1.0, 2.0]}],
            "unit": "USD", "note": None, "source": {"kind": "model"}, "truncated": False}
    out = charts.to_text(spec)
    assert "T (USD)" in out and "██" in out and "figures supplied" in out
