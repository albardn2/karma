"""`show_map`: the assistant draws a map in the user's chat.

Layers (any combination in one map):
  - pins:  one marker per record (customers, trip stops…), coloured by a group
           field, sized by a value field, with a label/popup;
  - heat:  density — records binned into a grid of cells, each cell weighted by
           count or by a value field (e.g. debt). Computed here, so the client
           needs no heatmap plugin and the model never invents a location;
  - routes: a trip's GPS track (location/trip/<uuid>) or a driver's track over a
           time window (location/user/<uuid>), drawn as a line.

Coordinates are Karma's "lat,lon" strings. Like charts, a `query` source is run
by the harness as the user, so the points are Karma's, not the model's.
"""
from __future__ import annotations

import math

from . import query_data as qd
from .geo import parse_coords  # noqa: F401  (re-exported: maps.parse_coords)
from .karma_client import KarmaError, fill_path

MODES = ["pins", "heat", "pins_and_heat"]
MAX_PINS = 3000
MAX_ROUTE_POINTS = 5000
MAX_HEAT_CELLS = 60  # per side
MAX_ROUTES = 6


def input_schema(list_endpoints: list[str]) -> dict:
    query = qd.NESTED_QUERY_SCHEMA()
    query["description"] = "Records to place on the map (a query_data query). Include the coordinates field."
    return {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "mode": {"type": "string", "enum": MODES,
                     "description": "pins = a marker per record; heat = density grid; pins_and_heat = both."},
            "query": query,
            "coords": {"type": "string", "description": "Field holding 'lat,lon' (default 'coordinates')."},
            "label": {"type": "string", "description": "Field shown on each pin (e.g. 'company_name')."},
            "value": {"type": "string", "description": "Numeric field: pin size and heat weight (e.g. "
                                                       "'balance_per_currency.SYP'). Without it heat counts records."},
            "group": {"type": "string", "description": "Field that colours pins (e.g. 'category', 'status')."},
            "unit": {"type": "string"},
            "routes": {
                "type": "array",
                "description": "GPS tracks to draw as lines: a trip (trip_uuid) or a user over a time window.",
                "items": {"type": "object", "properties": {
                    "trip_uuid": {"type": "string"},
                    "user_uuid": {"type": "string"},
                    "from_time": {"type": "string", "description": "ISO datetime, for user_uuid."},
                    "to_time": {"type": "string", "description": "ISO datetime, for user_uuid."},
                    "name": {"type": "string"}}},
            },
            "note": {"type": "string"},
        },
        "required": ["title"],
    }


def heat_grid(points: list[dict]) -> tuple[list[dict], float]:
    """Bin points into square-ish cells: at most MAX_HEAT_CELLS per side, at least ~200 m."""
    lats = [p["lat"] for p in points]
    lons = [p["lon"] for p in points]
    span = max(max(lats) - min(lats), max(lons) - min(lons), 0.002)
    cell = max(span / MAX_HEAT_CELLS, 0.002)   # degrees (~220 m of latitude)
    cells: dict[tuple[int, int], float] = {}
    counts: dict[tuple[int, int], int] = {}
    for p in points:
        k = (math.floor(p["lat"] / cell), math.floor(p["lon"] / cell))
        w = p["value"] if isinstance(p.get("value"), (int, float)) else 1.0
        cells[k] = cells.get(k, 0.0) + max(w, 0.0)
        counts[k] = counts.get(k, 0) + 1
    out = [{"lat": (i + 0.5) * cell, "lon": (j + 0.5) * cell, "weight": round(w, 4), "count": counts[(i, j)]}
           for (i, j), w in cells.items() if w > 0]
    out.sort(key=lambda c: -c["weight"])
    return out, cell


def _route(executor, r: dict) -> dict:
    if r.get("trip_uuid"):
        entry = executor.endpoints.get("location__trip_series")
        params, path_vals, name = {}, {"trip_uuid": r["trip_uuid"]}, r.get("name") or "Trip route"
    elif r.get("user_uuid"):
        entry = executor.endpoints.get("location__user_series")
        params = {k: r[k] for k in ("from_time", "to_time") if r.get(k)}
        params["limit"] = MAX_ROUTE_POINTS
        path_vals, name = {"user_uuid": r["user_uuid"]}, r.get("name") or "Route"
    else:
        raise ValueError("a route needs trip_uuid or user_uuid")
    if entry is None:
        raise ValueError("this user can't read location history")
    data = executor.client.request("GET", fill_path(entry["path"], path_vals), params=params)
    pts = data.get("points") if isinstance(data, dict) else None
    pts = sorted(pts or [], key=lambda p: p.get("recorded_at") or "")
    coords = [c for c in (parse_coords(p.get("coordinates")) for p in pts) if c]
    if len(coords) > MAX_ROUTE_POINTS:
        step = math.ceil(len(coords) / MAX_ROUTE_POINTS)
        coords = coords[::step]
    return {"name": name, "coords": [[a, b] for a, b in coords],
            "start": pts[0].get("recorded_at") if pts else None, "end": pts[-1].get("recorded_at") if pts else None}


def build(executor, args: dict) -> dict:
    mode = args.get("mode") or "pins"
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    if not args.get("query") and not args.get("routes"):
        raise ValueError("give a `query` (records to place) and/or `routes` (GPS tracks)")

    points: list[dict] = []
    dropped = 0
    source = None
    if args.get("query"):
        q = dict(args["query"])
        q.pop("group_by", None)
        q.pop("aggregates", None)       # a map plots records, not aggregates
        q["limit"] = qd.MAX_RESULT_ROWS
        coords_f = args.get("coords") or "coordinates"
        label_f, value_f, group_f = args.get("label"), args.get("value"), args.get("group")
        fields = [f for f in {coords_f, label_f, value_f, group_f} if f]
        from . import joins
        cache: dict = {}
        rows = joins.load(executor, q.get("endpoint"), q.get("params") or {}, cache,
                          int(q.get("max_rows") or qd.DEFAULT_MAX_ROWS))
        fetched = len(rows)
        rows = joins.apply_joins(executor, rows, q.get("join") or [], cache)
        rows = joins.apply_compute(rows, q.get("compute") or [])
        for cond in q.get("where") or []:
            rows = [r for r in rows if qd.matches(r, cond)]
        qd.sort_rows(rows, q.get("sort"))
        for r in rows:
            c = parse_coords(qd.get_path(r, coords_f))
            if c is None:
                dropped += 1
                continue
            p = {"lat": round(c[0], 6), "lon": round(c[1], 6)}
            if label_f:
                lab = qd.get_path(r, label_f)
                p["label"] = str(lab).strip() if lab is not None else ""
            if value_f:
                p["value"] = qd._num(qd.get_path(r, value_f))
            if group_f:
                g = qd.get_path(r, group_f)
                p["group"] = ", ".join(map(str, g)) if isinstance(g, list) else ("(none)" if g is None else str(g))
            points.append(p)
        source = {"kind": "query", "endpoint": q.get("endpoint"), "rows_fetched": fetched,
                  "rows_matched": len(rows), "without_coordinates": dropped}

    routes = [_route(executor, r) for r in (args.get("routes") or [])[:MAX_ROUTES]]
    if not points and not any(r["coords"] for r in routes):
        raise ValueError(f"nothing to map: no records with coordinates ({dropped} matched but had none)"
                         if dropped else "nothing to map: no records matched")

    heat, cell = ([], None)
    if points and mode in ("heat", "pins_and_heat"):
        heat, cell = heat_grid(points)
    truncated = len(points) > MAX_PINS
    pins = points[:MAX_PINS] if mode in ("pins", "pins_and_heat") else []

    all_coords = [(p["lat"], p["lon"]) for p in points] + [tuple(c) for r in routes for c in r["coords"]]
    bounds = [[min(a for a, _ in all_coords), min(b for _, b in all_coords)],
              [max(a for a, _ in all_coords), max(b for _, b in all_coords)]]
    groups = sorted({p["group"] for p in pins if "group" in p})
    return {
        "type": "map",
        "title": args.get("title") or "",
        "mode": mode,
        "pins": pins,
        "groups": groups,
        "heat": heat,
        "heat_cell_deg": cell,
        "routes": routes,
        "bounds": bounds,
        "unit": args.get("unit"),
        "value_field": args.get("value"),
        "note": args.get("note"),
        "source": source or {"kind": "routes"},
        "truncated": truncated,
        # chart-shaped fields so a client that only knows charts doesn't crash
        "labels": [],
        "series": [],
    }


def summary_for_model(spec: dict) -> str:
    lines = [f"Map shown to the user: '{spec['title']}' ({spec['mode']}): {len(spec['pins'])} pins, "
             f"{len(spec['heat'])} heat cells, {len(spec['routes'])} routes"
             f"{', pins truncated' if spec['truncated'] else ''}."]
    src = spec["source"]
    if src.get("kind") == "query" and src.get("without_coordinates"):
        lines.append(f"{src['without_coordinates']} matching records have no coordinates and are not on the map — "
                     "tell the user.")
    if spec["groups"]:
        counts = {g: sum(1 for p in spec["pins"] if p.get("group") == g) for g in spec["groups"]}
        lines.append("Pins per group: " + ", ".join(f"{g} {n}" for g, n in counts.items()))
    if spec["heat"]:
        top = spec["heat"][:5]
        lines.append("Densest cells (lat,lon: weight/records): " +
                     "; ".join(f"{c['lat']:.4f},{c['lon']:.4f}: {c['weight']:g}/{c['count']}" for c in top))
    for r in spec["routes"]:
        lines.append(f"Route '{r['name']}': {len(r['coords'])} GPS points from {r['start']} to {r['end']}.")
    (s, w), (n, e) = spec["bounds"]
    lines.append(f"Area: lat {s:.4f}–{n:.4f}, lon {w:.4f}–{e:.4f}. Summarise where things cluster; "
                 "don't list coordinates.")
    return "\n".join(lines)


def to_text(spec: dict) -> str:
    out = [f"🗺  {spec['title']} — {len(spec['pins'])} pins, {len(spec['heat'])} heat cells, "
           f"{len(spec['routes'])} routes (open the web app to see the map)"]
    for p in spec["pins"][:10]:
        out.append(f"  📍 {p.get('label', '')} {p.get('value', '') if p.get('value') is not None else ''} "
                   f"[{p['lat']:.4f},{p['lon']:.4f}]".rstrip())
    if len(spec["pins"]) > 10:
        out.append(f"  … {len(spec['pins']) - 10} more")
    return "\n".join(out)
