"""Cross-table analysis for query_data: datasets, joins, spatial joins, computed fields.

Karma's API returns one resource per list; most real questions span several
("revenue per service area" = orders → customer → the area polygon containing the
customer). The model should not stitch those together by hand, so the harness
does it deterministically, as the user, in a few well-defined operations:

  join      many-to-one enrichment (order.customer_uuid → customer), chainable:
            a later join may key on a field an earlier join added.
  join many one-to-many summary per row (customer → its orders: count, sum, max date…).
  spatial   point-in-polygon against service areas (row coordinates → area).
  compute   arithmetic, date ages and distances, without running model code.

Virtual datasets: "users" (the company's users, from /auth/users; admins only)
and "service_areas" (an alias of the service area list).
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from . import geo
from . import query_data as qd

VIRTUAL = {"users", "service_areas"}
SERVICE_AREAS_ENDPOINT = "service_area__list_service_areas"
# fields worth keeping from a joined record by default (everything scalar except these)
JOIN_SKIP = {"geometry", "polygon", "boundary", "is_deleted", "created_by_uuid", "permissions",
             "effective_permissions", "business_cards", "image"}
COMPUTE_OPS = ["add", "sub", "mul", "div", "pct", "days_since", "days_between", "distance_km", "concat", "coalesce"]
JOIN_AGGS = ["count", "sum", "avg", "min", "max", "count_distinct"]


# --------------------------------------------------------------------------- schema (for query_data)

def schema_extensions() -> dict:
    return {
        "join": {
            "type": "array",
            "description": (
                "Enrich each row from another dataset, applied in order (a later join can use a field an "
                "earlier one added). Kinds: (1) lookup: on=<this row's field>, other_on=<field in `with`, "
                "default uuid> → adds `as.<field>`; (2) many=true: summarise the matching rows of `with` "
                "(e.g. a customer's orders) with `aggregates` (+ optional `where`) → `as.<name>`; "
                "(3) spatial=true with with='service_areas': puts the service area containing the row's "
                "`coords` (default 'coordinates') into `as` (null when outside every area). `with` is any "
                "list endpoint name, 'users' or 'service_areas'."),
            "items": {
                "type": "object",
                "properties": {
                    "with": {"type": "string"},
                    "params": {"type": "object", "description": "Filters for the joined endpoint."},
                    "on": {"type": "string"},
                    "other_on": {"type": "string"},
                    "as": {"type": "string", "description": "Prefix for the added fields, e.g. 'customer'."},
                    "fields": {"type": "array", "items": {"type": "string"}},
                    "how": {"type": "string", "enum": ["left", "inner"]},
                    "many": {"type": "boolean"},
                    "where": {"type": "array", "items": {"type": "object"},
                              "description": "many=true: filter the joined rows first (same shape as top-level where)."},
                    "aggregates": {"type": "array", "items": {"type": "object", "properties": {
                        "op": {"type": "string", "enum": JOIN_AGGS}, "field": {"type": "string"},
                        "as": {"type": "string"}}, "required": ["op"]}},
                    "spatial": {"type": "boolean"},
                    "coords": {"type": "string"},
                },
                "required": ["with"],
            },
        },
        "compute": {
            "type": "array",
            "description": (
                "Add computed fields, in order, before `where`/grouping. ops: add, sub, mul, div, pct (a/b*100), "
                "days_since (a=date field; days until now), days_between (a, b dates), distance_km (a, b = "
                "'lat,lon' fields or literal 'lat,lon'), concat, coalesce (first non-null of a, b). a/b are field "
                "paths or literal numbers/strings."),
            "items": {"type": "object", "properties": {
                "as": {"type": "string"}, "op": {"type": "string", "enum": COMPUTE_OPS},
                "a": {}, "b": {}}, "required": ["as", "op", "a"]},
        },
        "having": {
            "type": "array",
            "description": "Filters applied AFTER grouping, on group fields or aggregate names (same shape as where).",
            "items": {"type": "object"},
        },
    }


# --------------------------------------------------------------------------- datasets

LIST_CACHE_TTL_S = 120


def load(executor, name: str, params: dict | None = None, cache: dict | None = None,
         max_rows: int = qd.DEFAULT_MAX_ROWS) -> list[dict]:
    """A whole dataset, as the user. Two caches: `cache` lives for one tool call;
    the executor's list cache lives for LIST_CACHE_TTL_S within the conversation, so
    follow-ups and joins don't re-download the same 2,000+ customers each time.
    The executor clears it after every approved write, so answers never show
    data from before a change the user just made."""
    key = (name, json.dumps(params or {}, sort_keys=True, default=str), max_rows)
    if cache is not None and key in cache:
        return cache[key]
    shared = getattr(executor, "list_cache", None)
    now = time.monotonic()
    if shared is not None and key in shared and now - shared[key][0] < LIST_CACHE_TTL_S:
        rows = shared[key][1]
    else:
        if name == "users":
            rows = users(executor)
        elif name == "service_areas":
            rows = qd.fetch_all(executor, SERVICE_AREAS_ENDPOINT, params or {}, max_rows)
        else:
            rows = qd.fetch_all(executor, name, params or {}, max_rows)
        if shared is not None:
            shared[key] = (now, rows)
    if cache is not None:
        cache[key] = rows
    return rows


def users(executor) -> list[dict]:
    """The company's users with display names. /auth/users is admin-only on the API;
    for anyone else this raises the API's 403, which the model reports."""
    data = executor.client.request("GET", "/auth/users")
    rows = data if isinstance(data, list) else next((v for v in (data or {}).values() if isinstance(v, list)), [])
    out = []
    for u in rows:
        if u.get("is_deleted"):
            continue
        name = " ".join(p for p in [u.get("first_name"), u.get("last_name")] if p).strip() or u.get("username")
        out.append({
            "uuid": u.get("uuid"), "username": u.get("username"), "full_name": name,
            "first_name": u.get("first_name"), "last_name": u.get("last_name"),
            "roles": u.get("permission_scope"), "is_active": u.get("is_active", True),
            "track_location": u.get("track_location"), "email": u.get("email"),
            "phone_number": u.get("phone_number"), "language": u.get("language"),
            "created_at": u.get("created_at"),
        })
    return out


# --------------------------------------------------------------------------- joins

def _pick(record: dict, fields: list[str] | None) -> dict:
    if fields:
        return {f: qd.get_path(record, f) for f in fields}
    return {k: v for k, v in record.items() if k not in JOIN_SKIP and not isinstance(v, (list, dict))}


def _attach(row: dict, prefix: str, value) -> dict:
    new = dict(row)
    new[prefix] = value
    return new


def apply_joins(executor, rows: list[dict], joins: list[dict], cache: dict) -> list[dict]:
    for j in joins or []:
        name = j.get("with")
        if not name:
            raise ValueError("each join needs `with`")
        prefix = j.get("as") or name.split("__")[0].rstrip("s")
        how = j.get("how") or "left"
        right = load(executor, name, j.get("params"), cache)

        if j.get("spatial"):
            areas = geo.build_areas(right)
            if not areas:
                raise ValueError(f"'{name}' has no polygons to join against")
            coords_f = j.get("coords") or "coordinates"
            out = []
            for r in rows:
                c = geo.parse_coords(qd.get_path(r, coords_f))
                hit = geo.locate(c[0], c[1], areas) if c else None
                if hit is None and how == "inner":
                    continue
                out.append(_attach(r, prefix, _pick(hit, j.get("fields")) if hit else None))
            rows = out
            continue

        on = j.get("on")
        if not on:
            raise ValueError(f"join with '{name}' needs `on` (this row's key field)")
        other = j.get("other_on") or "uuid"

        if j.get("many"):
            sub = right
            for cond in j.get("where") or []:
                sub = [x for x in sub if qd.matches(x, cond)]
            groups: dict[str, list] = {}
            for x in sub:
                k = qd.get_path(x, other)
                if k is not None:
                    groups.setdefault(str(k), []).append(x)
            aggs = j.get("aggregates") or [{"op": "count"}]
            out = []
            for r in rows:
                k = qd.get_path(r, on)
                members = groups.get(str(k), []) if k is not None else []
                if not members and how == "inner":
                    continue
                summary = qd.aggregate(members, [], aggs)[0] if members else {
                    (a.get("as") or (f"{a['op']}_{a['field']}" if a.get("field") else a["op"])):
                        (0 if a["op"] in ("count", "count_distinct", "sum") else None) for a in aggs}
                out.append(_attach(r, prefix, summary))
            rows = out
            continue

        index: dict[str, dict] = {}
        for x in right:
            k = qd.get_path(x, other)
            if k is not None:
                index.setdefault(str(k), x)
        out = []
        for r in rows:
            k = qd.get_path(r, on)
            hit = index.get(str(k)) if k is not None else None
            if hit is None and how == "inner":
                continue
            out.append(_attach(r, prefix, _pick(hit, j.get("fields")) if hit else None))
        rows = out
    return rows


# --------------------------------------------------------------------------- computed fields

def _has_path(row, path: str) -> bool:
    """Is `path` a field of this row (even if its value, or a parent like a
    non-matching join's `area`, is null)? Decided by the FIRST segment, so
    'area.name' is a field whenever the row has an `area` key at all."""
    if not isinstance(row, dict):
        return False
    return path in row or path.split(".", 1)[0] in row


def _value(row, v):
    """A literal number, or a field path — an existing field resolves to its value even
    when that value is null; strings that aren't fields stay literal ('now-7d' → a date)."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v
    if isinstance(v, str):
        if _has_path(row, v) or (":" in v and qd.get_path(row, v) is not None):
            return qd.get_path(row, v)
        if v.startswith("now"):
            return qd._relative_date(v)
        return v
    return v


def _date(v):
    if not isinstance(v, str) or len(v) < 10:
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def compute_one(row: dict, spec: dict):
    op = spec["op"]
    a, b = _value(row, spec.get("a")), _value(row, spec.get("b"))
    if op in ("add", "sub", "mul", "div", "pct"):
        x, y = qd._num(a), qd._num(b)
        if x is None or y is None:
            return None
        if op == "add":
            return round(x + y, 6)
        if op == "sub":
            return round(x - y, 6)
        if op == "mul":
            return round(x * y, 6)
        if y == 0:
            return None
        return round(x / y * (100 if op == "pct" else 1), 6)
    if op == "days_since":
        d = _date(a)
        return None if d is None else round((datetime.now(timezone.utc) - d).total_seconds() / 86400, 2)
    if op == "days_between":
        d1, d2 = _date(a), _date(b)
        return None if d1 is None or d2 is None else round((d2 - d1).total_seconds() / 86400, 2)
    if op == "distance_km":
        p, q = geo.parse_coords(a), geo.parse_coords(b)
        return None if p is None or q is None else round(geo.haversine_km(p, q), 3)
    if op == "concat":
        return "".join(str(x) for x in (a, b) if x is not None)
    if op == "coalesce":
        return a if a is not None else b
    raise ValueError(f"unknown compute op '{op}'")


def apply_compute(rows: list[dict], specs: list[dict]) -> list[dict]:
    if not specs:
        return rows
    for s in specs:
        if s.get("op") not in COMPUTE_OPS:
            raise ValueError(f"compute op must be one of {COMPUTE_OPS}")
        if not s.get("as"):
            raise ValueError("each compute needs `as`")
    out = []
    for r in rows:
        r = dict(r)
        for s in specs:
            r[s["as"]] = compute_one(r, s)
        out.append(r)
    return out
