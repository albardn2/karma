"""Joins, spatial joins, computed fields and the specialised helpers. No network, no model.

A small fake company with known answers:
  two service areas (North, South) as WKT polygons;
  customers in North (A, B), in South (C), outside both (D), without coordinates (E);
  orders, invoices of known ages, payments, notes, stock lots, sales and a GPS track.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from assistant import geo, joins, toolkit
from assistant import query_data as qd
from assistant.tests.test_assistant import ADMIN, FakeClient
from assistant.tools import Executor, endpoint_tools, harness_tools


def ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat().replace("+00:00", "Z")


NORTH = "POLYGON ((36.0 33.5, 36.2 33.5, 36.2 33.7, 36.0 33.7, 36.0 33.5))"
# South has a hole around (33.30, 36.10)
SOUTH = ("POLYGON ((36.0 33.2, 36.2 33.2, 36.2 33.4, 36.0 33.4, 36.0 33.2), "
         "(36.08 33.28, 36.12 33.28, 36.12 33.32, 36.08 33.32, 36.08 33.28))")

DATA = {
    "/service-area/": [
        {"uuid": "sa-n", "name": "North", "geometry": NORTH},
        {"uuid": "sa-s", "name": "South", "geometry": SOUTH},
    ],
    "/customer/": [
        {"uuid": "A", "company_name": "Alpha", "category": "minimarket", "coordinates": "33.60,36.10",
         "balance_per_currency": {"SYP": 300.0, "USD": 0.0}},
        {"uuid": "B", "company_name": "Beta", "category": "school", "coordinates": "33.55,36.05",
         "balance_per_currency": {"SYP": 0.0}},
        {"uuid": "C", "company_name": "Gamma", "category": "minimarket", "coordinates": "33.25,36.05",
         "balance_per_currency": {"SYP": 50.0}},
        {"uuid": "D", "company_name": "Delta", "category": "minimarket", "coordinates": "34.50,37.00",
         "balance_per_currency": {"USD": 20.0}},
        {"uuid": "E", "company_name": "Epsilon", "category": "school", "coordinates": None,
         "balance_per_currency": {}},
    ],
    "/customer-order/": [
        {"uuid": "o1", "customer_uuid": "A", "currency": "SYP", "total_adjusted_amount": 100.0,
         "created_by_uuid": "u1", "created_at": ago(3)},
        {"uuid": "o2", "customer_uuid": "A", "currency": "SYP", "total_adjusted_amount": 200.0,
         "created_by_uuid": "u2", "created_at": ago(40)},
        {"uuid": "o3", "customer_uuid": "B", "currency": "SYP", "total_adjusted_amount": 50.0,
         "created_by_uuid": "u1", "created_at": ago(5)},
        {"uuid": "o4", "customer_uuid": "C", "currency": "SYP", "total_adjusted_amount": 70.0,
         "created_by_uuid": "u1", "created_at": ago(10)},
        {"uuid": "o5", "customer_uuid": "D", "currency": "USD", "total_adjusted_amount": 20.0,
         "created_by_uuid": "u2", "created_at": ago(2)},
    ],
    "/invoice/": [
        {"uuid": "i1", "customer_uuid": "A", "currency": "SYP", "status": "pending", "net_amount_due": 100.0,
         "total_adjusted_amount": 100.0, "created_at": ago(10)},
        {"uuid": "i2", "customer_uuid": "A", "currency": "SYP", "status": "partially_paid", "net_amount_due": 150.0,
         "total_adjusted_amount": 200.0, "created_at": ago(45)},
        {"uuid": "i3", "customer_uuid": "C", "currency": "SYP", "status": "pending", "net_amount_due": 50.0,
         "total_adjusted_amount": 50.0, "created_at": ago(100)},
        {"uuid": "i4", "customer_uuid": "D", "currency": "USD", "status": "pending", "net_amount_due": 20.0,
         "total_adjusted_amount": 20.0, "created_at": ago(70)},
        {"uuid": "i5", "customer_uuid": "B", "currency": "SYP", "status": "paid", "net_amount_due": 0.0,
         "total_adjusted_amount": 50.0, "created_at": ago(5)},
    ],
    "/payment/": [
        {"uuid": "p1", "invoice_uuid": "i2", "currency": "SYP", "amount": 50.0, "payment_method": "cash",
         "created_at": ago(30)},
        {"uuid": "p2", "invoice_uuid": "i5", "currency": "SYP", "amount": 50.0, "payment_method": "cash",
         "created_at": ago(4)},
        {"uuid": "p3", "debit_note_item_uuid": "dn1", "currency": "SYP", "amount": 0.0, "created_at": ago(1)},
    ],
    "/debit-note-item/": [
        {"uuid": "dn1", "customer_uuid": "A", "currency": "SYP", "amount": 50.0, "amount_due": 50.0,
         "created_at": ago(20)},
    ],
    "/credit-note-item/": [
        {"uuid": "cn1", "customer_uuid": "A", "currency": "SYP", "amount": 0.0, "created_at": ago(15)},
    ],
    "/inventory/": [
        {"uuid": "l1", "material_uuid": "m1", "material_name": "Sugar", "unit": "kg", "current_quantity": 100.0,
         "cost_per_unit": 2.0, "cost_currency": "SYP", "is_active": True},
        {"uuid": "l2", "material_uuid": "m2", "material_name": "Tea", "unit": "pcs", "current_quantity": 10.0,
         "cost_per_unit": 5.0, "cost_currency": "SYP", "is_active": True},
        {"uuid": "l3", "material_uuid": "m2", "material_name": "Tea", "unit": "pcs", "current_quantity": 99.0,
         "is_active": False},
    ],
    "/vehicle-inventory/": [
        {"uuid": "v1", "material_uuid": "m2", "material_name": "Tea", "unit": "pcs", "current_quantity": 5.0,
         "is_active": True},
    ],
    "/customer-order-item/": [
        {"uuid": "it1", "material_uuid": "m1", "material_name": "Sugar", "quantity": 30, "is_fulfilled": True,
         "fulfilled_at": ago(5)},
        {"uuid": "it2", "material_uuid": "m2", "material_name": "Tea", "quantity": 30, "is_fulfilled": True,
         "fulfilled_at": ago(10)},
        {"uuid": "it3", "material_uuid": "m2", "material_name": "Tea", "quantity": 500, "is_fulfilled": True,
         "fulfilled_at": ago(90)},
    ],
    "/trip-stop/": [
        {"uuid": "s1", "trip_uuid": "t1", "index": 0, "status": "completed", "outcome": "sale",
         "coordinates": "33.60,36.10"},
        {"uuid": "s2", "trip_uuid": "t1", "index": 1, "status": "completed", "outcome": "interested",
         "coordinates": "33.55,36.05"},
        {"uuid": "s3", "trip_uuid": "t1", "index": 2, "status": "skipped", "coordinates": "33.25,36.05"},
    ],
}
USERS = {"users": [
    {"uuid": "u1", "username": "rami", "first_name": "Rami", "last_name": "K", "permission_scope": "sales",
     "is_active": True, "track_location": True},
    {"uuid": "u2", "username": "lina", "first_name": "Lina", "last_name": "", "permission_scope": "accountant",
     "is_active": True, "track_location": False},
    {"uuid": "u3", "username": "old", "first_name": "Old", "last_name": "User", "permission_scope": "driver",
     "is_active": False},
    {"uuid": "u4", "username": "gone", "is_deleted": True},
]}
TRIP = {"uuid": "t1", "name": "Rami-01", "status": "completed", "assigned_username": "rami",
        "vehicle_plate": "AAA", "start_time": "2026-11-07T08:00:00Z", "end_time": "2026-11-07T12:00:00Z",
        "cash_from_trip_sales": {"SYP": 150.0}}
GPS = {"points": [
    {"coordinates": "33.60,36.10", "recorded_at": "2026-11-07T08:00:00Z"},
    {"coordinates": "33.61,36.10", "recorded_at": "2026-11-07T08:10:00Z"},      # ~1.11 km
    {"coordinates": "35.00,38.00", "recorded_at": "2026-11-07T08:11:00Z"},      # GPS jump: ignored
    {"coordinates": "33.62,36.10", "recorded_at": "2026-11-07T08:20:00Z"},      # ~1.11 km from 33.61
]}


class CompanyClient(FakeClient):
    def request(self, method, path, params=None, body=None, idempotency_key=None):
        self.calls.append((method, path, dict(params or {}), body))
        params = params or {}
        if path in DATA:
            rows = DATA[path]
            for k in ("customer_uuid", "trip_uuid"):
                if params.get(k):
                    rows = [r for r in rows if r.get(k) == params[k]]
            key = {"/customer/": "customers", "/invoice/": "invoices", "/customer-order/": "orders",
                   "/payment/": "payments"}.get(path, "items")
            return {key: rows, "total_count": len(rows), "page": 1, "per_page": 100, "pages": 1}
        if path == "/auth/users":
            return USERS
        if path.startswith("/customer/"):
            uid = path.rsplit("/", 1)[-1]
            return next(c for c in DATA["/customer/"] if c["uuid"] == uid)
        if path == "/trip/t1":
            return TRIP
        if path == "/location/trip/t1":
            return GPS
        return super().request(method, path, params, body, idempotency_key)


@pytest.fixture
def ex():
    tools = endpoint_tools(ADMIN)
    e = Executor(CompanyClient(), harness_tools(tools, False) + tools)
    e.on_chart = lambda spec: None
    return e


# --------------------------------------------------------------------------- geo

def test_wkt_polygon_with_hole_and_multipolygon():
    south = geo.build_areas([{"name": "S", "geometry": SOUTH}])
    assert geo.locate(33.25, 36.05, south)["name"] == "S"
    assert geo.locate(33.30, 36.10, south) is None          # inside the hole
    multi = "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)), ((10 10, 11 10, 11 11, 10 11, 10 10)))"
    areas = geo.build_areas([{"name": "M", "geometry": multi}])
    assert geo.locate(10.5, 10.5, areas) and geo.locate(0.5, 0.5, areas) and not geo.locate(5, 5, areas)
    assert geo.parse_wkt("POINT (1 2)") is None and geo.parse_wkt(None) is None


def test_haversine():
    assert geo.haversine_km((33.60, 36.10), (33.61, 36.10)) == pytest.approx(1.112, abs=0.01)


# --------------------------------------------------------------------------- joins

def test_revenue_per_service_area_via_chained_and_spatial_joins(ex):
    out = qd.run(ex, {
        "endpoint": "customer_order__list_customer_orders",
        "join": [{"with": "customer__list_customers", "on": "customer_uuid", "as": "customer"},
                 {"with": "service_areas", "spatial": True, "coords": "customer.coordinates", "as": "area"}],
        "group_by": ["area.name", "currency"],
        "aggregates": [{"op": "sum", "field": "total_adjusted_amount", "as": "revenue"}, {"op": "count"}],
        "sort": [{"field": "revenue", "desc": True}],
    })
    got = {(r["area.name"], r["currency"]): (r["revenue"], r["count"]) for r in out["result"]}
    assert got == {("North", "SYP"): (350.0, 3), ("South", "SYP"): (70.0, 1), (None, "USD"): (20.0, 1)}


def test_customers_outside_every_area(ex):
    out = qd.run(ex, {"endpoint": "customer__list_customers",
                      "join": [{"with": "service_areas", "spatial": True, "as": "area"}],
                      "where": [{"field": "area", "op": "is_null"}], "fields": ["company_name"]})
    assert {r["company_name"] for r in out["result"]} == {"Delta", "Epsilon"}   # outside, and no coordinates


def test_inner_spatial_join_drops_unmatched(ex):
    out = qd.run(ex, {"endpoint": "customer__list_customers",
                      "join": [{"with": "service_areas", "spatial": True, "as": "area", "how": "inner",
                                "fields": ["name"]}],
                      "group_by": ["area.name"], "aggregates": [{"op": "count"}]})
    assert {r["area.name"]: r["count"] for r in out["result"]} == {"North": 2, "South": 1}


def test_revenue_per_salesperson_name_via_users(ex):
    out = qd.run(ex, {"endpoint": "customer_order__list_customer_orders",
                      "join": [{"with": "users", "on": "created_by_uuid", "as": "user"}],
                      "where": [{"field": "currency", "op": "eq", "value": "SYP"}],
                      "group_by": ["user.full_name"],
                      "aggregates": [{"op": "sum", "field": "total_adjusted_amount", "as": "revenue"}]})
    assert {r["user.full_name"]: r["revenue"] for r in out["result"]} == {"Rami K": 220.0, "Lina": 200.0}


def test_one_to_many_summary_and_having(ex):
    out = qd.run(ex, {
        "endpoint": "customer__list_customers",
        "join": [{"with": "customer_order__list_customer_orders", "on": "uuid", "other_on": "customer_uuid",
                  "many": True, "as": "orders",
                  "aggregates": [{"op": "count"}, {"op": "max", "field": "created_at", "as": "last"}]}],
        "compute": [{"as": "days_since_last", "op": "days_since", "a": "orders.last"}],
        "where": [{"field": "orders.count", "op": "gte", "value": 1}],
        "fields": ["company_name", "orders.count", "days_since_last"],
        "sort": [{"field": "orders.count", "desc": True}]})
    first = out["result"][0]
    assert first["company_name"] == "Alpha" and first["orders.count"] == 2
    assert first["days_since_last"] == pytest.approx(3, abs=0.1)
    assert out["rows_matched"] == 4                       # Epsilon has no orders

    g = qd.run(ex, {"endpoint": "customer_order__list_customer_orders", "group_by": ["customer_uuid"],
                    "aggregates": [{"op": "count"}], "having": [{"field": "count", "op": "gt", "value": 1}]})
    assert [r["customer_uuid"] for r in g["result"]] == ["A"]


def test_coalesce_labels_rows_outside_every_area(ex):
    # the exact query the model wrote for "revenue per service area"
    out = qd.run(ex, {
        "endpoint": "customer_order__list_customer_orders",
        "join": [{"with": "customer__list_customers", "on": "customer_uuid", "as": "customer"},
                 {"with": "service_areas", "spatial": True, "coords": "customer.coordinates", "as": "area"}],
        "compute": [{"as": "area_label", "op": "coalesce", "a": "area.name", "b": "Outside any area"}],
        "group_by": ["area_label"], "aggregates": [{"op": "count"}]})
    assert {r["area_label"] for r in out["result"]} == {"North", "South", "Outside any area"}


def test_compute_distance_and_arithmetic(ex):
    out = qd.run(ex, {"endpoint": "customer__list_customers",
                      "compute": [{"as": "km", "op": "distance_km", "a": "coordinates", "b": "33.60,36.10"},
                                  {"as": "double", "op": "mul", "a": "balance_per_currency.SYP", "b": 2}],
                      "where": [{"field": "km", "op": "lte", "value": 8}],
                      "fields": ["company_name", "km", "double"], "sort": [{"field": "km"}]})
    assert [r["company_name"] for r in out["result"]] == ["Alpha", "Beta"]
    assert out["result"][0]["km"] == 0 and out["result"][0]["double"] == 600.0


def test_compute_ops_edge_cases():
    row = {"a": 10, "b": 0, "d1": "2026-01-01T00:00:00Z", "d2": "2026-01-11T00:00:00Z", "x": None, "y": "k"}
    assert joins.compute_one(row, {"op": "div", "a": "a", "b": "b"}) is None
    assert joins.compute_one(row, {"op": "pct", "a": 5, "b": "a"}) == 50.0
    assert joins.compute_one(row, {"op": "days_between", "a": "d1", "b": "d2"}) == 10.0
    assert joins.compute_one(row, {"op": "coalesce", "a": "x", "b": "y"}) == "k"
    with pytest.raises(ValueError):
        joins.apply_compute([row], [{"as": "z", "op": "eval", "a": "1"}])


def test_map_can_use_joins(ex):
    seen = []
    ex.on_chart = seen.append
    text, err = ex.run("show_map", {"title": "North customers",
                                    "query": {"endpoint": "customer__list_customers",
                                              "join": [{"with": "service_areas", "spatial": True, "as": "area"}],
                                              "where": [{"field": "area.name", "op": "eq", "value": "North"}]},
                                    "label": "company_name", "group": "area.name"})
    assert not err, text
    assert {p["label"] for p in seen[0]["pins"]} == {"Alpha", "Beta"} and seen[0]["groups"] == ["North"]


# --------------------------------------------------------------------------- helpers

def test_list_users(ex):
    text, err = ex.run("list_users", {})
    assert not err and '"count":2' in text and "Rami K" in text and "gone" not in text
    out = toolkit.list_users(ex, {"active_only": False, "role": "driver"})
    assert [u["username"] for u in out["users"]] == ["old"]


def test_ar_aging_buckets_per_currency(ex):
    out = toolkit.ar_aging(ex, {})
    syp = out["totals_by_currency"]["SYP"]
    # i1 100 @10d → 0-30, dn1 50 @20d → 0-30, i2 150 @45d → 31-60, i3 50 @100d → 90+
    assert (syp["0-30"], syp["31-60"], syp["61-90"], syp["90+"], syp["total"]) == (150.0, 150.0, 0.0, 50.0, 350.0)
    assert out["totals_by_currency"]["USD"]["61-90"] == 20.0
    top = out["customers_by_currency"]["SYP"][0]
    assert top["customer"] == "Alpha" and top["total"] == 300.0 and top["oldest_days"] == 45
    assert toolkit.ar_aging(ex, {"currency": "USD"})["customers_with_debt"] == {"USD": 1}


def test_customer_statement_running_balance_matches_record(ex):
    out = toolkit.customer_statement(ex, {"customer_uuid": "A"})
    syp = out["by_currency"]["SYP"]
    # invoices 200 + 100, debit note 50, credit note 0, payment 50 → 300
    assert syp["debits"] == 350.0 and syp["credits"] == 50.0 and syp["balance"] == 300.0
    assert syp["matches_record"] is True
    assert [l["type"] for l in syp["lines"]][0] == "invoice"          # oldest first
    period = toolkit.customer_statement(ex, {"customer_uuid": "A", "from_date": "now-12d"})
    p = period["by_currency"]["SYP"]
    assert p["opening_balance"] == 200.0 and p["balance"] == 300.0     # i2, p1, dn1, cn1 before the window


def test_stock_position_days_of_cover(ex):
    out = toolkit.stock_position(ex, {"sales_days": 30})
    rows = {r["material"]: r for r in out["rows"]}
    assert rows["Tea"]["on_hand"] == 15.0 and rows["Tea"]["sold_qty"] == 30.0     # inactive lot + 90-day sale ignored
    assert rows["Tea"]["days_of_cover"] == 15.0
    assert rows["Sugar"]["days_of_cover"] == 100.0 and rows["Sugar"]["stock_cost"] == {"SYP": 200.0}
    assert out["rows"][0]["material"] == "Tea"                                   # runs out first
    assert out["negative_stock_materials"] == []


def test_negative_stock_is_flagged_not_turned_into_a_cover_figure(ex, monkeypatch):
    rows = DATA["/inventory/"] + [{"uuid": "l9", "material_uuid": "m9", "material_name": "Oversold",
                                   "current_quantity": -50.0, "is_active": True}]
    monkeypatch.setitem(DATA, "/inventory/", rows)
    monkeypatch.setitem(DATA, "/customer-order-item/", DATA["/customer-order-item/"] + [
        {"uuid": "it9", "material_uuid": "m9", "material_name": "Oversold", "quantity": 10, "is_fulfilled": True,
         "fulfilled_at": ago(1)}])
    out = toolkit.stock_position(ex, {})
    first = out["rows"][0]
    assert first["material"] == "Oversold" and first["negative_stock"] and first["days_of_cover"] is None
    assert out["negative_stock_materials"] == ["Oversold"] and "NEGATIVE" in out["note"]


def test_compare_periods(ex):
    out = toolkit.compare_periods(ex, {
        "query": {"endpoint": "customer_order__list_customer_orders", "group_by": ["currency"],
                  "aggregates": [{"op": "sum", "field": "total_adjusted_amount", "as": "revenue"}]},
        "current": {"from": "now-30d"}, "previous": {"from": "now-60d", "to": "now-30d"}})
    syp = next(r for r in out["rows"] if r["currency"] == "SYP")["revenue"]
    assert (syp["current"], syp["previous"], syp["change"]) == (220.0, 200.0, 20.0)
    assert syp["change_pct"] == 10.0
    for preset in toolkit.PRESETS:
        toolkit.compare_periods(ex, {"query": {"endpoint": "customer_order__list_customer_orders",
                                               "aggregates": [{"op": "count"}]}, "preset": preset})


def test_trip_metrics(ex):
    out = toolkit.trip_metrics(ex, {"trip_uuid": "t1"})
    assert out["duration_hours"] == 4.0 and out["stops"] == 3
    assert out["stops_by_status"] == {"completed": 2, "skipped": 1}
    assert out["km_driven_gps"] == pytest.approx(2.22, abs=0.05) and out["gps_jumps_ignored"] == 1
    assert out["minutes_per_completed_stop"] == 120.0


def test_helpers_are_deferred_tools(ex):
    from assistant.tools import endpoint_tools, harness_tools
    by = {t.name: t for t in harness_tools(endpoint_tools(ADMIN), False)}
    for name in toolkit.TOOLS:
        assert by[name].deferred and by[name].is_read
    assert {"users", "service_areas"} <= set(by["query_data"].input_schema["properties"]["endpoint"]["enum"])
