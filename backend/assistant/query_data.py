"""`query_data`: declarative analysis over a list endpoint, run by the harness.

Works with any model (it is an ordinary tool), runs no model-written code, and
keeps intermediate rows out of the model's context: the harness pages through
the endpoint AS THE USER, then filters, groups, aggregates and sorts locally.
"""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .karma_client import KarmaError

DEFAULT_MAX_ROWS = 5000
HARD_MAX_ROWS = 20000
PAGE_SIZE = 100
# pages fetched at once; production serves the API with 2 workers × 4 threads,
# so 4 in flight speeds one user up without crowding out everyone else
PAGE_CONCURRENCY = 4
MAX_RESULT_ROWS = 200

OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "not_in", "is_null", "not_null"]
AGGS = ["count", "sum", "avg", "min", "max", "count_distinct"]


def INPUT_SCHEMA_TEMPLATE(list_endpoints: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "endpoint": {"type": "string", "enum": list_endpoints,
                         "description": "A list endpoint tool name (GET, no path parameters)."},
            "params": {"type": "object", "description": "The endpoint's own filters (no page/per_page)."},
            "where": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "op": {"type": "string", "enum": OPS},
                        "value": {"description": "Comparison value. Dates as ISO strings, or 'now-30d' style relative dates."},
                    },
                    "required": ["field", "op"],
                },
            },
            "group_by": {"type": "array", "items": {"type": "string"},
                         "description": "Fields to group by. Date fields accept a bucket suffix: "
                                        "'created_at:day|week|month|quarter|year|weekday|hour' "
                                        "(local business time; weekday = Mon..Sun, hour = 00:00..23:00)."},
            "aggregates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "op": {"type": "string", "enum": AGGS},
                        "field": {"type": "string", "description": "Not needed for count."},
                        "as": {"type": "string"},
                    },
                    "required": ["op"],
                },
            },
            "sort": {
                "type": "array",
                "items": {"type": "object", "properties": {"field": {"type": "string"}, "desc": {"type": "boolean"}},
                          "required": ["field"]},
            },
            "fields": {"type": "array", "items": {"type": "string"},
                       "description": "Fields to return per row when not aggregating."},
            "limit": {"type": "integer", "minimum": 1, "maximum": MAX_RESULT_ROWS},
            "max_rows": {"type": "integer", "minimum": 1, "maximum": HARD_MAX_ROWS},
            **_joins_schema(),
        },
        "required": ["endpoint"],
    }


def _joins_schema() -> dict:
    from .joins import schema_extensions
    return schema_extensions()


def NESTED_QUERY_SCHEMA() -> dict:
    """The same query shape for show_chart / show_map, WITHOUT repeating the ~60-name
    endpoint enum (it is in query_data's schema once; every request re-sends tool
    definitions). Unknown names are rejected by fetch_all with suggestions."""
    s = INPUT_SCHEMA_TEMPLATE([])
    s["properties"]["endpoint"] = {"type": "string",
                                   "description": "A list endpoint name, as in query_data's `endpoint`."}
    return s


# --------------------------------------------------------------------------- fetching

def _rows_key(page: dict) -> str | None:
    for k, v in page.items():
        if isinstance(v, list) and (not v or isinstance(v[0], dict)):
            return k
    return None


def fetch_all(executor, endpoint: str, params: dict, max_rows: int = DEFAULT_MAX_ROWS) -> list[dict]:
    from .tools import call_endpoint

    entry = executor.endpoints.get(endpoint)
    if entry is None or entry["method"] != "GET" or entry["path_params"]:
        import difflib
        names = [n for n, e in executor.endpoints.items() if e["method"] == "GET" and not e["path_params"]]
        close = difflib.get_close_matches(str(endpoint), names, n=3, cutoff=0.4)
        hint = f" Did you mean: {', '.join(close)}?" if close else ""
        raise ValueError(f"'{endpoint}' is not a list endpoint this user can read.{hint}")
    max_rows = max(1, min(int(max_rows), HARD_MAX_ROWS))
    params = {k: v for k, v in (params or {}).items() if k not in ("page", "per_page")}
    paginated = "per_page" in ((entry.get("query_schema") or {}).get("properties") or {})

    def get(page: int):
        args = dict(params, **({"page": page, "per_page": PAGE_SIZE} if paginated else {}))
        data = call_endpoint(executor.client, entry, args)
        if isinstance(data, list):
            return data, 1
        if not isinstance(data, dict):
            raise ValueError("endpoint did not return a list")
        key = _rows_key(data)
        if key is None:
            raise ValueError("endpoint did not return a list of records")
        return data[key], (data.get("pages") or 1)

    rows, pages = get(1)
    rows = list(rows)
    if paginated and pages > 1 and len(rows) < max_rows:
        # the first page says how many there are: fetch the rest a few at a time
        # (in order), instead of one round trip after another
        last = min(pages, -(-max_rows // PAGE_SIZE))
        rest = list(range(2, last + 1))
        if rest:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=min(PAGE_CONCURRENCY, len(rest))) as pool:
                for page_rows, _ in pool.map(get, rest):
                    rows.extend(page_rows)
    return rows[:max_rows]


# --------------------------------------------------------------------------- evaluation

DATE_BUCKETS = ("day", "week", "month", "quarter", "year", "weekday", "hour")
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
HOURS = [f"{h:02d}:00" for h in range(24)]

# Buckets are in the business's local time: a 01:00 sale in Damascus is
# 22:00 UTC the day before, and hour-of-day / weekday analysis must not shift it.
LOCAL_TZ_NAME = os.environ.get("ASSISTANT_TZ", "Asia/Damascus")
try:
    LOCAL_TZ = ZoneInfo(LOCAL_TZ_NAME)
except Exception:  # unknown zone or no tz database: fall back to UTC, never crash
    LOCAL_TZ = timezone.utc


def _bucket(value, unit: str):
    """ISO date/datetime string -> its day / ISO week / month / quarter / year /
    weekday (Mon..Sun) / hour (00:00..23:00) label, in local time."""
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is not None:
        d = d.astimezone(LOCAL_TZ)
    if unit == "weekday":
        return WEEKDAYS[d.weekday()]
    if unit == "hour":
        return HOURS[d.hour]
    if unit == "day":
        return d.strftime("%Y-%m-%d")
    if unit == "week":
        y, w, _ = d.isocalendar()
        return f"{y}-W{w:02d}"
    if unit == "month":
        return d.strftime("%Y-%m")
    if unit == "quarter":
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    return str(d.year)


def get_path(row, path: str):
    """Dotted field lookup. A ':day|:week|:month|:quarter|:year' suffix buckets a date
    field, e.g. 'created_at:month' -> '2026-11'."""
    # aggregated / projected rows carry the literal names ('created_at:month', 'balance_per_currency.USD')
    if isinstance(row, dict) and path in row:
        return row[path]
    if ":" in path:
        base, unit = path.rsplit(":", 1)
        if unit in DATE_BUCKETS:
            return _bucket(get_path(row, base), unit)
    cur = row
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return None
    return cur


def _relative_date(value):
    """'now', 'now-30d', 'now+7d', 'now-12h' -> ISO string (UTC)."""
    if not isinstance(value, str) or not value.startswith("now"):
        return value
    rest = value[3:]
    now = datetime.now(timezone.utc)
    if not rest:
        return now.isoformat()
    sign = -1 if rest[0] == "-" else 1
    num, unit = rest[1:-1], rest[-1]
    delta = {"d": timedelta(days=1), "h": timedelta(hours=1), "w": timedelta(weeks=1)}.get(unit)
    if delta is None or not num.isdigit():
        return value
    return (now + sign * int(num) * delta).isoformat()


def _cmp_pair(a, b):
    """Make a and b comparable: numbers as floats, else strings (ISO dates sort as strings)."""
    if isinstance(a, (int, float)) and not isinstance(a, bool):
        try:
            return float(a), float(b)
        except (TypeError, ValueError):
            return str(a), str(b)
    return str(a), str(b)


def matches(row, cond: dict) -> bool:
    v = get_path(row, cond["field"])
    op = cond["op"]
    target = _relative_date(cond.get("value"))
    if op == "is_null":
        return v is None
    if op == "not_null":
        return v is not None
    if op == "contains":
        if isinstance(v, list):
            return target in v
        return v is not None and str(target).lower() in str(v).lower()
    if op in ("in", "not_in"):
        inside = v in (target or [])
        return inside if op == "in" else not inside
    if op == "eq":
        return v == target or (v is not None and target is not None and str(v) == str(target))
    if op == "ne":
        return not (v == target or (v is not None and target is not None and str(v) == str(target)))
    if v is None or target is None:
        return False
    a, b = _cmp_pair(v, target)
    return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]


def _num(v):
    if isinstance(v, bool) or v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def aggregate(rows: list[dict], group_by: list[str], aggs: list[dict]) -> list[dict]:
    aggs = aggs or [{"op": "count"}]
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[tuple(get_path(r, g) for g in group_by)].append(r)
    if not group_by and not groups:
        groups[()] = []  # an ungrouped aggregate over nothing is one row: count 0, sum 0

    out = []
    for key, members in groups.items():
        rec = {g: (k if not isinstance(k, (list, dict)) else str(k)) for g, k in zip(group_by, key)}
        for a in aggs:
            op, field = a["op"], a.get("field")
            name = a.get("as") or (f"{op}_{field}" if field else op)
            vals = [get_path(m, field) for m in members] if field else members
            nums = [n for n in (_num(v) for v in vals) if n is not None] if field else []
            if op == "count":
                rec[name] = len(members) if not field else sum(1 for v in vals if v is not None)
            elif op == "count_distinct":
                rec[name] = len({str(v) for v in vals if v is not None})
            elif op == "sum":
                rec[name] = round(sum(nums), 4) + 0.0  # + 0.0 turns -0.0 into 0.0
            elif op == "avg":
                rec[name] = round(sum(nums) / len(nums), 4) if nums else None
            elif op == "min":
                rec[name] = min(nums) if nums else min((v for v in vals if v is not None), default=None)
            elif op == "max":
                rec[name] = max(nums) if nums else max((v for v in vals if v is not None), default=None)
        out.append(rec)
    return out


def sort_rows(rows, sort):
    # stable sorts, last key first; rows missing the field always go last
    for s in reversed(sort or []):
        f, desc = s["field"], bool(s.get("desc"))
        present = [r for r in rows if get_path(r, f) is not None]
        missing = [r for r in rows if get_path(r, f) is None]
        present.sort(key=lambda r: _sortable(get_path(r, f)), reverse=desc)
        rows[:] = present + missing
    return rows


def _sortable(v):
    n = _num(v)
    return (0, n, "") if n is not None else (1, 0.0, str(v))


def project(rows, fields):
    if not fields:
        return rows
    return [{f: get_path(r, f) for f in fields} for r in rows]


def run(executor, args: dict) -> dict:
    """fetch → join → compute → where → group/aggregate → having → sort → fields/limit."""
    from . import joins

    endpoint = args.get("endpoint")
    max_rows = int(args.get("max_rows") or DEFAULT_MAX_ROWS)
    cache: dict = {}
    rows = joins.load(executor, endpoint, args.get("params") or {}, cache, max_rows)
    fetched = len(rows)
    rows = joins.apply_joins(executor, rows, args.get("join") or [], cache)
    rows = joins.apply_compute(rows, args.get("compute") or [])
    for cond in args.get("where") or []:
        rows = [r for r in rows if matches(r, cond)]
    matched = len(rows)
    group_by = args.get("group_by") or []
    if group_by or args.get("aggregates"):
        rows = aggregate(rows, group_by, args.get("aggregates") or [])
        for cond in args.get("having") or []:
            rows = [r for r in rows if matches(r, cond)]
    sort_rows(rows, args.get("sort"))
    if not (group_by or args.get("aggregates")):
        rows = project(rows, args.get("fields"))
    limit = min(int(args.get("limit") or 50), MAX_RESULT_ROWS)
    return {
        "rows_fetched": fetched,
        "rows_matched": matched,
        "truncated_fetch": fetched >= int(args.get("max_rows") or DEFAULT_MAX_ROWS),
        "result_count": len(rows),
        "result": rows[:limit],
    }
