"""`show_chart`: the assistant draws a chart in the user's chat.

The chart is rendered by the client (recharts in the web widget, a text bar
chart in the terminal) from a small JSON spec — no images.

Numbers come from the data, not the model, whenever possible: with a `query`
source the harness runs the query itself (as the user, through query_data) and
charts what comes back. A `data` source — numbers the model supplies — is only
for combining results already fetched, and is labelled as such in the chart.
"""
from __future__ import annotations

from . import query_data as qd

CHART_TYPES = ["bar", "horizontal_bar", "stacked_bar", "line", "area", "pie", "heatmap"]
MAX_POINTS = 60
MAX_SERIES = 8
MAX_HEATMAP_ROWS = 31

INPUT_SCHEMA_EXTRA = {
    "title": {"type": "string", "description": "Short chart title, in the user's language."},
    "type": {"type": "string", "enum": CHART_TYPES},
    "x": {"type": "string", "description": "query source: result field for the categories / x axis "
                                            "(e.g. 'customer.company_name', 'created_at:month')."},
    "y": {
        "type": "array",
        "description": "query source: result fields to plot, one series each.",
        "items": {"type": "object", "properties": {"field": {"type": "string"}, "label": {"type": "string"}},
                  "required": ["field"]},
    },
    "series_by": {"type": "string", "description": "query source: split ONE y field into a series per value "
                                                   "of this field (e.g. per driver or per currency)."},
    "data": {
        "type": "object",
        "description": "Only when combining results you already have: labels plus series values.",
        "properties": {
            "labels": {"type": "array", "items": {"type": ["string", "number"]}},
            "series": {"type": "array", "items": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "values": {"type": "array", "items": {"type": ["number", "null"]}}},
                "required": ["name", "values"]}},
        },
        "required": ["labels", "series"],
    },
    "x_label": {"type": "string"},
    "y_label": {"type": "string"},
    "unit": {"type": "string", "description": "e.g. 'USD', 'SYP', 'invoices'. Never mix currencies in one series."},
    "note": {"type": "string", "description": "One short line shown under the chart."},
}


def input_schema(list_endpoints: list[str]) -> dict:
    query = qd.NESTED_QUERY_SCHEMA()
    query["description"] = ("Preferred source: a query_data query; the harness runs it and charts the result, "
                            "so the numbers come straight from Karma.")
    return {
        "type": "object",
        "properties": {**INPUT_SCHEMA_EXTRA, "query": query},
        "required": ["title", "type"],
    }


def _label(v) -> str:
    if v is None:
        return "(none)"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _num(v):
    n = qd._num(v)
    return None if n is None else round(n, 4)


def build(executor, args: dict) -> dict:
    """Validate the request and return a client-ready chart spec."""
    ctype = args.get("type")
    if ctype not in CHART_TYPES:
        raise ValueError(f"type must be one of {CHART_TYPES}")
    has_query, has_data = bool(args.get("query")), bool(args.get("data"))
    if has_query == has_data:
        raise ValueError("give exactly one of `query` (preferred) or `data`")

    if has_query:
        q = dict(args["query"])
        q.setdefault("limit", MAX_POINTS * MAX_SERIES)
        q["limit"] = min(int(q["limit"]), qd.MAX_RESULT_ROWS)
        result = qd.run(executor, q)
        rows = result["result"]
        x = args.get("x")
        ys = args.get("y") or []
        if not x or not ys:
            raise ValueError("a query chart needs `x` and at least one `y` field")
        series_by = args.get("series_by")
        if series_by:
            if len(ys) != 1:
                raise ValueError("series_by works with exactly one y field")
            yf = ys[0]["field"]
            labels: list[str] = []
            by: dict[str, dict[str, float | None]] = {}
            for r in rows:
                lab, s = _label(qd.get_path(r, x)), _label(qd.get_path(r, series_by))
                if lab not in labels:
                    labels.append(lab)
                by.setdefault(s, {})[lab] = _num(qd.get_path(r, yf))
            series = [{"name": s, "values": [vals.get(l) for l in labels]} for s, vals in by.items()]
        else:
            labels = [_label(qd.get_path(r, x)) for r in rows]
            series = [{"name": y.get("label") or y["field"], "values": [_num(qd.get_path(r, y["field"])) for r in rows]}
                      for y in ys]
        source = {"kind": "query", "endpoint": q.get("endpoint"), "rows_matched": result["rows_matched"],
                  "rows_fetched": result["rows_fetched"], "truncated": result["truncated_fetch"]}
    else:
        d = args["data"]
        labels = [_label(l) for l in d.get("labels") or []]
        series = [{"name": str(s.get("name")), "values": [_num(v) for v in s.get("values") or []]}
                  for s in d.get("series") or []]
        for s in series:
            if len(s["values"]) != len(labels):
                raise ValueError(f"series '{s['name']}' has {len(s['values'])} values for {len(labels)} labels")
        source = {"kind": "model"}

    if not labels or not series:
        raise ValueError("nothing to chart: the query returned no rows")
    labels, series = _canonical_order(labels, series)
    if ctype == "heatmap":
        series = _canonical_rows(series)
        if len(series) < 2 and len(labels) < 2:
            raise ValueError("a heatmap needs a grid: use series_by for the rows (or several data series)")
    if ctype == "pie" and len(series) != 1:
        raise ValueError("a pie chart takes exactly one series")
    truncated = False
    if len(labels) > MAX_POINTS:
        labels = labels[:MAX_POINTS]
        for s in series:
            s["values"] = s["values"][:MAX_POINTS]
        truncated = True
    max_series = MAX_HEATMAP_ROWS if ctype == "heatmap" else MAX_SERIES
    if len(series) > max_series:
        series = series[:max_series]
        truncated = True
    return {
        "title": args.get("title") or "",
        "type": ctype,
        "labels": labels,
        "series": series,
        "x_label": args.get("x_label"),
        "y_label": args.get("y_label"),
        "unit": args.get("unit"),
        "note": args.get("note"),
        "source": source,
        "truncated": truncated,
    }


def _order_key(values: list[str]):
    """Natural order for weekday / hour labels; None when the labels are anything else."""
    if values and all(v in qd.WEEKDAYS for v in values):
        return qd.WEEKDAYS.index
    if values and all(v in qd.HOURS for v in values):
        return qd.HOURS.index
    return None


def _canonical_order(labels, series):
    key = _order_key(labels)
    if key is None:
        return labels, series
    order = sorted(range(len(labels)), key=lambda i: key(labels[i]))
    return ([labels[i] for i in order],
            [dict(s, values=[s["values"][i] for i in order]) for s in series])


def _canonical_rows(series):
    key = _order_key([s["name"] for s in series])
    return sorted(series, key=lambda s: key(s["name"])) if key else series


def summary_for_model(spec: dict) -> str:
    """What the model gets back: confirmation plus the plotted numbers, so its text matches the chart."""
    lines = [f"Chart shown to the user: '{spec['title']}' ({spec['type']}, {len(spec['labels'])} points, "
             f"{len(spec['series'])} series{', truncated' if spec['truncated'] else ''}). "
             "Don't repeat every number in text; summarise the takeaway."]
    if spec["type"] == "heatmap":
        cells = [(v, s["name"], l) for s in spec["series"] for l, v in zip(spec["labels"], s["values"]) if v]
        cells.sort(reverse=True)
        lines.append("Hottest cells (row × column = value): " +
                     "; ".join(f"{r} × {c} = {v:g}" for v, r, c in cells[:15]))
        lines.append("Row totals: " + ", ".join(f"{s['name']} {sum(v or 0 for v in s['values']):g}" for s in spec["series"]))
        return "\n".join(lines)
    for s in spec["series"]:
        pairs = ", ".join(f"{l}: {v}" for l, v in zip(spec["labels"], s["values"]))
        lines.append(f"{s['name']}: {pairs[:1500]}")
    return "\n".join(lines)


def to_text(spec: dict, width: int = 28) -> str:
    """Terminal rendering: a simple horizontal bar chart per series."""
    out = [f"📊 {spec['title']}" + (f" ({spec['unit']})" if spec.get("unit") else "")]
    for s in spec["series"]:
        vals = [v for v in s["values"] if v is not None]
        top = max((abs(v) for v in vals), default=0) or 1
        if len(spec["series"]) > 1:
            out.append(f"  {s['name']}")
        lab_w = min(24, max((len(l) for l in spec["labels"]), default=4))
        for l, v in zip(spec["labels"], s["values"]):
            bar = "█" * int(round(abs(v or 0) / top * width))
            out.append(f"  {l[:lab_w]:<{lab_w}} {bar} {'' if v is None else f'{v:,.2f}'.rstrip('0').rstrip('.')}")
    if spec.get("note"):
        out.append(f"  {spec['note']}")
    src = spec["source"]
    out.append("  source: " + (f"{src['endpoint']} ({src['rows_matched']} records)" if src["kind"] == "query"
                               else "figures supplied by the assistant"))
    return "\n".join(out)
