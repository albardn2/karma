"""Specialised analysis helpers: the calculations a model should not improvise.

Each helper reads Karma AS THE USER (through the executor's permission-filtered
endpoints) and returns a compact, ready-to-explain result. All read-only.

  list_users          the company's users with names and roles
  ar_aging            receivables by age bucket (0-30/31-60/61-90/90+), per currency
  customer_statement  one customer's invoices, payments and notes with a running balance
  stock_position      on hand (warehouses + vehicles), sales rate, days of cover
  compare_periods     any query_data metric, this period vs the previous one
  trip_metrics        km driven, duration, stops and pace for one trip
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import geo
from . import joins
from . import query_data as qd

UNPAID = {"pending", "partially_paid"}
EPS = 0.005  # money tolerance (half a cent), like the backend's MONEY_TOLERANCE
BUCKETS = [(30, "0-30"), (60, "31-60"), (90, "61-90"), (None, "90+")]


def _now():
    return datetime.now(timezone.utc)


def _date(v):
    return joins._date(v)


def _days(v):
    d = _date(v)
    return None if d is None else (_now() - d).total_seconds() / 86400


def _name(c: dict | None) -> str:
    if not c:
        return "(unknown)"
    return (c.get("company_name") or c.get("full_name") or "").strip() or "(no name)"


def _r(x, n=2):
    return round(x + 0.0, n)


# --------------------------------------------------------------------------- list_users

def list_users(ex, args: dict) -> dict:
    rows = joins.users(ex)
    q = (args.get("search") or "").strip().lower()
    if q:
        rows = [u for u in rows if q in " ".join(str(u.get(k) or "") for k in ("username", "full_name", "email",
                                                                                   "phone_number")).lower()]
    if args.get("role"):
        rows = [u for u in rows if args["role"] in (u.get("roles") or "").split(",")]
    if args.get("active_only", True):
        rows = [u for u in rows if u.get("is_active", True)]
    return {"count": len(rows), "users": rows}


# --------------------------------------------------------------------------- ar_aging

def _bucket(days: float) -> str:
    for limit, label in BUCKETS:
        if limit is None or days <= limit:
            return label
    return "90+"


def ar_aging(ex, args: dict) -> dict:
    basis = args.get("basis") or "invoice_date"
    currency = args.get("currency")
    cache: dict = {}
    items = []
    for inv in joins.load(ex, "invoice__list_invoices", {}, cache):
        due = qd._num(inv.get("net_amount_due")) or 0
        if inv.get("status") not in UNPAID or due <= EPS:
            continue
        date = inv.get("due_date") if basis == "due_date" and inv.get("due_date") else inv.get("created_at")
        items.append({"customer_uuid": inv.get("customer_uuid"), "currency": inv.get("currency"),
                      "amount": due, "days": _days(date) or 0, "kind": "invoice"})
    if args.get("include_debit_notes", True) and "debit_note_item__list_debit_note_items" in ex.endpoints:
        for dn in joins.load(ex, "debit_note_item__list_debit_note_items", {}, cache):
            due = qd._num(dn.get("amount_due")) or 0
            if dn.get("customer_uuid") and due > EPS:
                items.append({"customer_uuid": dn["customer_uuid"], "currency": dn.get("currency"),
                              "amount": due, "days": _days(dn.get("created_at")) or 0, "kind": "debit_note"})
    if currency:
        items = [i for i in items if i["currency"] == currency]

    labels = [l for _, l in BUCKETS]
    totals: dict[str, dict] = {}
    per: dict[tuple, dict] = {}
    for i in items:
        b = _bucket(i["days"])
        t = totals.setdefault(i["currency"], {l: 0.0 for l in labels} | {"total": 0.0, "documents": 0})
        t[b] += i["amount"]
        t["total"] += i["amount"]
        t["documents"] += 1
        p = per.setdefault((i["customer_uuid"], i["currency"]),
                           {l: 0.0 for l in labels} | {"total": 0.0, "oldest_days": 0, "documents": 0})
        p[b] += i["amount"]
        p["total"] += i["amount"]
        p["documents"] += 1
        p["oldest_days"] = max(p["oldest_days"], int(i["days"]))

    customers = {}
    if per:
        customers = {c["uuid"]: c for c in joins.load(ex, "customer__list_customers", {}, cache)}
    rows = []
    for (cu, cur), p in per.items():
        rows.append({"customer": _name(customers.get(cu)), "customer_uuid": cu, "currency": cur,
                     **{k: (_r(v) if isinstance(v, float) else v) for k, v in p.items()}})
    rows.sort(key=lambda r: (r["currency"], -r["total"]))
    limit = int(args.get("limit") or 25)
    by_cur: dict[str, list] = {}
    for r in rows:
        by_cur.setdefault(r["currency"], []).append(r)
    return {
        "basis": "due date (falls back to invoice date)" if basis == "due_date" else "invoice date",
        "buckets_days": labels,
        "totals_by_currency": {c: {k: (_r(v) if isinstance(v, float) else v) for k, v in t.items()}
                               for c, t in totals.items()},
        "customers_by_currency": {c: rs[:limit] for c, rs in by_cur.items()},
        "customers_with_debt": {c: len(rs) for c, rs in by_cur.items()},
    }


# --------------------------------------------------------------------------- customer_statement

def customer_statement(ex, args: dict) -> dict:
    cu = args.get("customer_uuid")
    if not cu:
        raise ValueError("customer_uuid is required (find it with customer__list_customers search)")
    start = _date(qd._relative_date(args["from_date"])) if args.get("from_date") else None
    end = _date(qd._relative_date(args["to_date"])) if args.get("to_date") else None
    cache: dict = {}
    customer = ex.client.request("GET", f"/customer/{cu}")
    lines = []
    invoices = joins.load(ex, "invoice__list_invoices", {"customer_uuid": cu}, cache)
    inv_ids = {i["uuid"] for i in invoices}
    for i in invoices:
        if i.get("status") == "void":
            continue
        lines.append({"date": i.get("created_at"), "type": "invoice", "ref": i["uuid"][:8], "currency": i.get("currency"),
                      "debit": qd._num(i.get("total_adjusted_amount", i.get("total_amount"))) or 0, "credit": 0.0,
                      "status": i.get("status")})
    dn_ids = set()
    if "debit_note_item__list_debit_note_items" in ex.endpoints:
        for d in joins.load(ex, "debit_note_item__list_debit_note_items", {}, cache):
            if d.get("customer_uuid") == cu:
                dn_ids.add(d["uuid"])
                lines.append({"date": d.get("created_at"), "type": "debit_note", "ref": d["uuid"][:8],
                              "currency": d.get("currency"), "debit": qd._num(d.get("amount")) or 0, "credit": 0.0,
                              "note": d.get("notes")})
    if "credit_note_item__list_credit_note_items" in ex.endpoints:
        for c in joins.load(ex, "credit_note_item__list_credit_note_items", {}, cache):
            if c.get("customer_uuid") == cu:
                lines.append({"date": c.get("created_at"), "type": "credit_note", "ref": c["uuid"][:8],
                              "currency": c.get("currency"), "debit": 0.0, "credit": qd._num(c.get("amount")) or 0,
                              "note": c.get("notes")})
    if inv_ids or dn_ids:
        for p in joins.load(ex, "payment__list_payments", {}, cache):
            if p.get("invoice_uuid") in inv_ids or p.get("debit_note_item_uuid") in dn_ids:
                lines.append({"date": p.get("created_at"), "type": "payment", "ref": p["uuid"][:8],
                              "currency": p.get("currency"), "debit": 0.0, "credit": qd._num(p.get("amount")) or 0,
                              "method": p.get("payment_method")})
    lines.sort(key=lambda l: l["date"] or "")

    out_by_cur: dict[str, dict] = {}
    for l in lines:
        cur = out_by_cur.setdefault(l["currency"], {"opening_balance": 0.0, "lines": [], "debits": 0.0,
                                                     "credits": 0.0, "balance": 0.0})
        d = _date(l["date"])
        delta = l["debit"] - l["credit"]
        if start and d and d < start:
            cur["opening_balance"] += delta
            cur["balance"] += delta
            continue
        if end and d and d > end:
            continue
        cur["balance"] += delta
        cur["debits"] += l["debit"]
        cur["credits"] += l["credit"]
        cur["lines"].append({**l, "date": (l["date"] or "")[:10], "balance": _r(cur["balance"])})
    recorded = (customer or {}).get("balance_per_currency") or {}
    for c, v in out_by_cur.items():
        for k in ("opening_balance", "debits", "credits", "balance"):
            v[k] = _r(v[k])
        rec = qd._num(recorded.get(c))
        v["balance_on_customer_record"] = rec
        # flags a mismatch between the statement and Karma's own balance (e.g. data issues)
        v["matches_record"] = None if rec is None or end else abs(rec - v["balance"]) < 0.01
        lim = int(args.get("limit") or 60)
        if len(v["lines"]) > lim:
            v["omitted_earlier_lines"] = len(v["lines"]) - lim
            v["lines"] = v["lines"][-lim:]
    return {"customer": _name(customer), "customer_uuid": cu,
            "period": {"from": args.get("from_date"), "to": args.get("to_date")}, "by_currency": out_by_cur}


# --------------------------------------------------------------------------- stock_position

def stock_position(ex, args: dict) -> dict:
    days = max(1, int(args.get("sales_days") or 30))
    q = (args.get("material_query") or "").strip().lower()
    cache: dict = {}
    mats: dict[str, dict] = {}

    def m(uuid, name, unit=None):
        return mats.setdefault(uuid, {"material": name, "material_uuid": uuid, "unit": unit, "warehouse_qty": 0.0,
                                      "vehicle_qty": 0.0, "stock_cost": {}, "sold_qty": 0.0})

    for lot in joins.load(ex, "inventory__list_inventories", {}, cache):
        if lot.get("is_active") is False:
            continue
        r = m(lot.get("material_uuid"), lot.get("material_name"), lot.get("unit"))
        qty = qd._num(lot.get("current_quantity")) or 0
        r["warehouse_qty"] += qty
        cost = qd._num(lot.get("cost_per_unit"))
        if cost is not None and lot.get("cost_currency"):
            r["stock_cost"][lot["cost_currency"]] = r["stock_cost"].get(lot["cost_currency"], 0) + qty * cost
    if "vehicle_inventory__list_vehicle_inventories" in ex.endpoints:
        for v in joins.load(ex, "vehicle_inventory__list_vehicle_inventories", {}, cache):
            if v.get("is_active") is False:
                continue
            m(v.get("material_uuid"), v.get("material_name"), v.get("unit"))["vehicle_qty"] += \
                qd._num(v.get("current_quantity")) or 0
    since = _now() - timedelta(days=days)
    for it in joins.load(ex, "customer_order_item__list_order_items", {}, cache):
        d = _date(it.get("fulfilled_at"))
        if it.get("is_fulfilled") and d and d >= since:
            m(it.get("material_uuid"), it.get("material_name"), it.get("unit"))["sold_qty"] += \
                qd._num(it.get("quantity")) or 0

    rows = []
    for r in mats.values():
        if q and q not in (r["material"] or "").lower():
            continue
        on_hand = r["warehouse_qty"] + r["vehicle_qty"]
        rate = r["sold_qty"] / days
        if not args.get("include_inactive") and on_hand <= 0 and r["sold_qty"] <= 0:
            continue
        negative = on_hand < -EPS
        rows.append({**r, "on_hand": _r(on_hand), "warehouse_qty": _r(r["warehouse_qty"]),
                     "vehicle_qty": _r(r["vehicle_qty"]), "sold_qty": _r(r["sold_qty"]),
                     "sold_per_day": _r(rate, 3),
                     # negative stock is a data problem (sold more than was received);
                     # a days-of-cover figure would be meaningless, so flag it instead
                     "days_of_cover": (_r(max(on_hand, 0) / rate, 1) if rate > 0 and not negative else None),
                     "negative_stock": negative,
                     "stock_cost": {c: _r(v) for c, v in r["stock_cost"].items()}})
    # data problems first, then what runs out soonest; things that don't sell go last
    rows.sort(key=lambda r: (not r["negative_stock"], r["days_of_cover"] is None,
                             r["days_of_cover"] if r["days_of_cover"] is not None else 0))
    limit = int(args.get("limit") or 40)
    neg = [r["material"] for r in rows if r["negative_stock"]]
    return {"sales_window_days": days, "materials": len(rows), "rows": rows[:limit],
            "negative_stock_materials": neg,
            "note": "days_of_cover = on_hand ÷ average daily quantity fulfilled in the window. "
                    + (f"{len(neg)} material(s) show NEGATIVE stock — more sold than received; tell the user "
                       "this is a stock-recording problem to fix." if neg else "")}


# --------------------------------------------------------------------------- compare_periods

def _presets(name: str) -> tuple[tuple, tuple]:
    now = _now().astimezone(qd.LOCAL_TZ)
    day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if name == "this_month_vs_last_month":
        cur_start = day0.replace(day=1)
        prev_start = (cur_start - timedelta(days=1)).replace(day=1)
        span = now - cur_start               # month-to-date vs the same span of last month
        return (cur_start, now), (prev_start, min(prev_start + span, cur_start))
    if name == "last_month_vs_month_before":
        cur_start = (day0.replace(day=1) - timedelta(days=1)).replace(day=1)
        cur_end = day0.replace(day=1)
        prev_start = (cur_start - timedelta(days=1)).replace(day=1)
        return (cur_start, cur_end), (prev_start, cur_start)
    if name.startswith("last_") and name.endswith("d_vs_prior"):
        n = int(name[len("last_"):-len("d_vs_prior")])
        return (now - timedelta(days=n), now), (now - timedelta(days=2 * n), now - timedelta(days=n))
    if name == "this_year_vs_last_year":
        cur_start = day0.replace(month=1, day=1)
        prev_start = cur_start.replace(year=cur_start.year - 1)
        return (cur_start, now), (prev_start, prev_start + (now - cur_start))
    raise ValueError("unknown preset")


PRESETS = ["this_month_vs_last_month", "last_month_vs_month_before", "last_7d_vs_prior",
           "last_30d_vs_prior", "last_90d_vs_prior", "this_year_vs_last_year"]


def compare_periods(ex, args: dict) -> dict:
    q = dict(args.get("query") or {})
    if not q.get("endpoint") or not q.get("aggregates"):
        raise ValueError("query needs an endpoint and at least one aggregate")
    field = args.get("date_field") or "created_at"
    if args.get("preset"):
        (cs, ce), (ps, pe) = _presets(args["preset"])
        cur = (cs.isoformat(), ce.isoformat())
        prev = (ps.isoformat(), pe.isoformat())
    else:
        c, p = args.get("current") or {}, args.get("previous") or {}
        cur = (qd._relative_date(c.get("from")), qd._relative_date(c.get("to") or "now"))
        prev = (qd._relative_date(p.get("from")), qd._relative_date(p.get("to")))
        if not (cur[0] and prev[0] and prev[1]):
            raise ValueError("give a preset, or current.from and previous.from/to")

    def run(window):
        qq = dict(q, where=list(q.get("where") or []) + [{"field": field, "op": "gte", "value": window[0]},
                                                         {"field": field, "op": "lt", "value": window[1]}],
                  limit=qd.MAX_RESULT_ROWS)
        qq.pop("having", None)
        return qd.run(ex, qq)["result"]

    a, b = run(cur), run(prev)
    gb = q.get("group_by") or []
    names = [(x.get("as") or (f"{x['op']}_{x['field']}" if x.get("field") else x["op"])) for x in q["aggregates"]]
    key = lambda r: tuple(str(r.get(g)) for g in gb)
    ia, ib = {key(r): r for r in a}, {key(r): r for r in b}
    rows = []
    for k in list(ia) + [k for k in ib if k not in ia]:
        ra, rb = ia.get(k, {}), ib.get(k, {})
        row = {g: (ra or rb).get(g) for g in gb}
        for n in names:
            x, y = qd._num(ra.get(n)) or 0, qd._num(rb.get(n)) or 0
            row[n] = {"current": _r(x), "previous": _r(y), "change": _r(x - y),
                      "change_pct": (_r((x - y) / y * 100, 1) if y else None)}
        rows.append(row)
    if names:
        rows.sort(key=lambda r: -abs(r[names[0]]["current"]))
    return {"current_period": {"from": cur[0][:19], "to": cur[1][:19]},
            "previous_period": {"from": prev[0][:19], "to": prev[1][:19]},
            "date_field": field, "rows": rows[: int(args.get("limit") or 50)]}


# --------------------------------------------------------------------------- trip_metrics

def trip_metrics(ex, args: dict) -> dict:
    tid = args.get("trip_uuid")
    if not tid:
        raise ValueError("trip_uuid is required (find it with trip__list_trips)")
    trip = ex.client.request("GET", f"/trip/{tid}")
    out = {"trip": trip.get("name"), "trip_uuid": tid, "status": trip.get("status"),
           "driver": trip.get("assigned_username"), "vehicle": trip.get("vehicle_plate"),
           "start_time": trip.get("start_time"), "end_time": trip.get("end_time")}
    st, et = _date(trip.get("start_time")), _date(trip.get("end_time"))
    if st and et:
        out["duration_hours"] = _r((et - st).total_seconds() / 3600)

    if "location__trip_series" in ex.endpoints:
        data = ex.client.request("GET", f"/location/trip/{tid}")
        pts = sorted((p for p in (data.get("points") or []) if geo.parse_coords(p.get("coordinates"))),
                     key=lambda p: p.get("recorded_at") or "")
        # Distance from the last GOOD fix: a point implying >150 km/h is a GPS
        # glitch and is dropped as a point (not just its segment), so the real
        # movement around it still counts.
        km, skipped = 0.0, 0
        last = pts[0] if pts else None
        for q in pts[1:]:
            a, b = geo.parse_coords(last["coordinates"]), geo.parse_coords(q["coordinates"])
            d = geo.haversine_km(a, b)
            t1, t2 = _date(last.get("recorded_at")), _date(q.get("recorded_at"))
            hours = (t2 - t1).total_seconds() / 3600 if t1 and t2 else None
            if hours is not None and hours > 0 and d / hours > 150:
                skipped += 1
                continue
            km += d
            last = q
        out["gps_points"] = len(pts)
        out["km_driven_gps"] = _r(km)
        out["gps_jumps_ignored"] = skipped
        if len(pts) < 10:
            out["gps_note"] = "few GPS points: distance is a lower bound (straight lines between sparse fixes)"

    stops = joins.load(ex, "trip_stop__list_trip_stops", {"trip_uuid": tid}, {}) \
        if "trip_stop__list_trip_stops" in ex.endpoints else []
    if stops:
        by_status: dict[str, int] = {}
        by_outcome: dict[str, int] = {}
        for s in stops:
            by_status[s.get("status") or "?"] = by_status.get(s.get("status") or "?", 0) + 1
            if s.get("outcome"):
                by_outcome[s["outcome"]] = by_outcome.get(s["outcome"], 0) + 1
        out["stops"] = len(stops)
        out["stops_by_status"] = by_status
        out["stops_by_outcome"] = by_outcome
        done = by_status.get("completed", 0)
        if out.get("duration_hours") and done:
            out["minutes_per_completed_stop"] = _r(out["duration_hours"] * 60 / done, 1)
        coords = [geo.parse_coords(s.get("coordinates")) for s in sorted(stops, key=lambda s: s.get("index") or 0)]
        coords = [c for c in coords if c]
        if len(coords) > 1:
            out["km_between_stops_straight_line"] = _r(sum(geo.haversine_km(a, b) for a, b in zip(coords, coords[1:])))
    for k in ("cash_from_trip_sales", "cash_from_debt", "trip_expenses", "net_expected_cash"):
        if trip.get(k) is not None:
            out[k] = trip[k]
    return out


# --------------------------------------------------------------------------- registry

TOOLS = {
    "list_users": (
        "List the company's users (staff accounts) with full names, usernames, roles, active status, phone, "
        "email and whether location tracking is on. Use it to answer 'who is…', list users/drivers/sales reps, "
        "or to turn a created_by_uuid / user uuid into a name (or join with dataset 'users' in query_data). "
        "Admins only.",
        {"type": "object", "properties": {
            "search": {"type": "string"}, "role": {"type": "string"},
            "active_only": {"type": "boolean", "description": "default true"}}},
        list_users),
    "ar_aging": (
        "Accounts receivable aging: unpaid invoices (and open debit notes) bucketed 0-30 / 31-60 / 61-90 / 90+ "
        "days, totals per currency and the customers behind them. For 'aging report', 'how old is our debt', "
        "'who has owed us the longest'.",
        {"type": "object", "properties": {
            "currency": {"type": "string", "enum": ["USD", "SYP"]},
            "basis": {"type": "string", "enum": ["invoice_date", "due_date"]},
            "include_debit_notes": {"type": "boolean"},
            "limit": {"type": "integer", "description": "customers per currency, default 25"}}},
        ar_aging),
    "customer_statement": (
        "Account statement for ONE customer: invoices, debit notes, credit notes and payments in date order "
        "with a running balance per currency, optional period (opening balance carried in), and a check "
        "against the balance on the customer record.",
        {"type": "object", "properties": {
            "customer_uuid": {"type": "string"},
            "from_date": {"type": "string", "description": "ISO date or 'now-30d'"},
            "to_date": {"type": "string"},
            "limit": {"type": "integer", "description": "max lines per currency (latest kept), default 60"}},
         "required": ["customer_uuid"]},
        customer_statement),
    "stock_position": (
        "Stock on hand per material (warehouse lots + vehicles), its cost value, quantity sold in the last N "
        "days and days of cover at that rate, sorted by what runs out first. For 'what's in stock', 'what will "
        "run out', 'what should we reorder'.",
        {"type": "object", "properties": {
            "material_query": {"type": "string", "description": "part of a material name"},
            "sales_days": {"type": "integer", "description": "sales window, default 30"},
            "include_inactive": {"type": "boolean"}, "limit": {"type": "integer"}}},
        stock_position),
    "compare_periods": (
        "Compare any query_data metric between two periods (current vs previous), optionally per group: "
        "values, change and % change. Use a preset or explicit windows. For 'this month vs last month', "
        "'growth', 'are we up or down'.",
        {"type": "object", "properties": {
            "query": {"type": "object", "description": "A query_data query with aggregates (and optional group_by, "
                                                         "where, join, compute) — no date filter; the windows add it."},
            "date_field": {"type": "string", "description": "default created_at"},
            "preset": {"type": "string", "enum": PRESETS},
            "current": {"type": "object", "properties": {"from": {"type": "string"}, "to": {"type": "string"}}},
            "previous": {"type": "object", "properties": {"from": {"type": "string"}, "to": {"type": "string"}}},
            "limit": {"type": "integer"}},
         "required": ["query"]},
        compare_periods),
    "trip_metrics": (
        "Operational metrics for one trip: driver, vehicle, duration, km driven (GPS), stops by status and "
        "outcome, minutes per completed stop, straight-line km between stops, cash fields.",
        {"type": "object", "properties": {"trip_uuid": {"type": "string"}}, "required": ["trip_uuid"]},
        trip_metrics),
}
