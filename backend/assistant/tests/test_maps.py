"""Heatmaps, local-time buckets and maps. No network, no model."""
from __future__ import annotations

from assistant import maps
from assistant import query_data as qd
from assistant.tests.test_assistant import ADMIN, FakeClient, admin_executor
from assistant.tools import Executor, endpoint_tools, harness_tools


# --------------------------------------------------------------------------- buckets & heatmap

def test_weekday_and_hour_buckets_use_local_time():
    # Sunday 22:30 UTC is Monday 01:30 in Damascus (UTC+3)
    row = {"t": "2026-11-15T22:30:00Z"}
    assert qd.get_path(row, "t:weekday") == "Mon"
    assert qd.get_path(row, "t:hour") == "01:00"
    assert qd.get_path(row, "t:day") == "2026-11-16"


def test_heatmap_grid_is_pivoted_and_naturally_ordered():
    ex, _ = admin_executor()
    seen = []
    ex.on_chart = seen.append
    text, err = ex.run("show_chart", {
        "title": "Invoices by weekday and currency", "type": "heatmap",
        "query": {"endpoint": "invoice__list_invoices", "group_by": ["created_at:weekday", "currency"],
                  "aggregates": [{"op": "count"}], "sort": [{"field": "count", "desc": True}]},
        "x": "created_at:weekday", "y": [{"field": "count"}], "series_by": "currency",
    })
    assert not err, text
    spec = seen[0]
    assert spec["labels"] == [d for d in qd.WEEKDAYS if d in spec["labels"]]   # Mon..Sun, not by count
    assert {s["name"] for s in spec["series"]} == {"SYP", "USD"}
    assert sum(v or 0 for s in spec["series"] for v in s["values"]) == 250
    assert "Hottest cells" in text


def test_heatmap_needs_a_grid():
    ex, _ = admin_executor()
    text, err = ex.run("show_chart", {"title": "x", "type": "heatmap",
                                      "data": {"labels": ["a"], "series": [{"name": "s", "values": [1]}]}})
    assert err and "grid" in text


# --------------------------------------------------------------------------- maps

class GeoClient(FakeClient):
    CUSTOMERS = [
        {"uuid": "c1", "company_name": "A", "category": "school", "coordinates": "33.50,36.30",
         "balance_per_currency": {"SYP": 100.0}},
        {"uuid": "c2", "company_name": "B", "category": "minimarket", "coordinates": "33.5005,36.3005",
         "balance_per_currency": {"SYP": 50.0}},
        {"uuid": "c3", "company_name": "C", "category": "school", "coordinates": "33.60,36.40",
         "balance_per_currency": {"SYP": 0.0}},
        {"uuid": "c4", "company_name": "No location", "category": "school", "coordinates": None,
         "balance_per_currency": {"SYP": 999.0}},
    ]

    def request(self, method, path, params=None, body=None, idempotency_key=None):
        if path == "/customer/":
            self.calls.append((method, path, dict(params or {}), body))
            return {"customers": self.CUSTOMERS, "total_count": 4, "page": 1, "per_page": 100, "pages": 1}
        if path.startswith("/location/trip/"):
            self.calls.append((method, path, dict(params or {}), body))
            return {"points": [{"coordinates": "33.51,36.31", "recorded_at": "2026-11-07T09:00:00Z"},
                               {"coordinates": "33.50,36.30", "recorded_at": "2026-11-07T08:00:00Z"}]}
        return super().request(method, path, params, body, idempotency_key)


def geo_executor():
    tools = endpoint_tools(ADMIN)
    ex = Executor(GeoClient(), harness_tools(tools, False) + tools)
    seen = []
    ex.on_chart = seen.append
    return ex, seen


def test_parse_coords():
    assert maps.parse_coords("33.5,36.3") == (33.5, 36.3)
    assert maps.parse_coords([33.5, 36.3]) == (33.5, 36.3)
    assert maps.parse_coords({"lat": 1, "lng": 2}) == (1.0, 2.0)
    for bad in (None, "x", "200,10", "0,0", ""):
        assert maps.parse_coords(bad) is None


def test_map_pins_groups_values_and_missing_coordinates():
    ex, seen = geo_executor()
    text, err = ex.run("show_map", {"title": "Customers", "mode": "pins_and_heat",
                                    "query": {"endpoint": "customer__list_customers"},
                                    "label": "company_name", "group": "category",
                                    "value": "balance_per_currency.SYP"})
    assert not err, text
    spec = seen[0]
    assert spec["type"] == "map" and len(spec["pins"]) == 3
    assert spec["pins"][0] == {"lat": 33.5, "lon": 36.3, "label": "A", "value": 100.0, "group": "school"}
    assert spec["groups"] == ["minimarket", "school"]
    assert spec["source"]["without_coordinates"] == 1 and "no coordinates" in text
    # A and B are ~70 m apart: same heat cell, weighted by debt; C owes 0 so it adds no cell
    assert len(spec["heat"]) == 1
    assert spec["heat"][0]["weight"] == 150.0 and spec["heat"][0]["count"] == 2
    assert spec["bounds"] == [[33.5, 36.3], [33.6, 36.4]]


def test_map_where_filters_and_heat_only_mode():
    ex, seen = geo_executor()
    _, err = ex.run("show_map", {"title": "Schools", "mode": "heat",
                                 "query": {"endpoint": "customer__list_customers",
                                           "where": [{"field": "category", "op": "eq", "value": "school"}]}})
    assert not err
    assert seen[0]["pins"] == [] and sum(c["count"] for c in seen[0]["heat"]) == 2


def test_map_trip_route_is_time_ordered():
    ex, seen = geo_executor()
    text, err = ex.run("show_map", {"title": "Trip", "routes": [{"trip_uuid": "t1"}]})
    assert not err, text
    assert seen[0]["routes"][0]["coords"] == [[33.5, 36.3], [33.51, 36.31]]
    assert "2 GPS points" in text


def test_map_needs_something_to_show():
    ex, _ = geo_executor()
    text, err = ex.run("show_map", {"title": "x"})
    assert err and "query" in text
