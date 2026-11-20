"""Turns the generated endpoint catalog into tools, and executes tool calls.

Provider-neutral: tools are described as `ToolSpec`s (name, description, JSON
schema, flags); each provider adapter renders them in its own wire format.

Safety does not depend on the model:
  - a user only gets tools for endpoints their effective permissions allow
    (the API re-checks every call anyway — this filter is for relevance);
  - in the spike only READ endpoints are exposed, and the executor refuses
    anything else even if a model names it;
  - every call goes out with the user's own token (see karma_client).
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .karma_client import KarmaClient, KarmaError, fill_path
from . import query_data as qd

CATALOG_PATH = Path(__file__).with_name("catalog.json")

# Keys that are large and never useful to a model reading business data.
DROP_KEYS = {"geometry", "polygon", "boundary", "geom", "route_geometry", "business_cards", "path"}
# Every result is re-sent with each later request in the conversation, so it pays
# to keep them lean. Raw pages bigger than this are cut; query_data is the tool
# for anything that needs more rows.
MAX_RESULT_CHARS = 12_000


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict
    deferred: bool = False          # loaded on demand through tool search
    code_callable: bool = False     # callable from code execution (programmatic calling)
    direct_callable: bool = True
    is_read: bool = True
    entry: dict | None = None       # catalog entry for endpoint tools
    risk: str = "read"              # read | write | strong (see actions.risk)


# --------------------------------------------------------------------------- permissions

METHOD_ACTIONS = {"POST": "create", "GET": "read", "PUT": "update", "PATCH": "update", "DELETE": "delete"}


def endpoint_allowed(permissions: dict | None, blueprint: str, action: str) -> bool:
    """Same rule as app/entrypoint/routes/common/permissions.endpoint_allowed."""
    if permissions is None:
        return True
    allowed = (permissions.get("endpoints") or {}).get(blueprint) or []
    return action in allowed


def permitted(entry: dict, me: dict) -> bool:
    # account feature cap binds everyone (platform owner exempt: None)
    if not endpoint_allowed(me.get("account_permissions"), entry["blueprint"], entry["action"]):
        return False
    scopes = set((me.get("permission_scope") or "").split(","))
    if scopes & {"admin", "superuser"}:
        return True
    return endpoint_allowed(me.get("effective_permissions"), entry["blueprint"], entry["action"])


# --------------------------------------------------------------------------- catalog -> tools

def load_catalog() -> list[dict]:
    return json.loads(CATALOG_PATH.read_text())


def _merge_defs(target: dict, schema: dict) -> dict:
    schema = copy.deepcopy(schema)
    defs = schema.pop("$defs", None)
    if defs:
        target.setdefault("$defs", {}).update(defs)
    return schema


def endpoint_input_schema(entry: dict) -> dict:
    root: dict[str, Any] = {"type": "object", "properties": {}, "required": []}
    for p in entry["path_params"]:
        root["properties"][p] = {"type": "string", "description": f"Path parameter `{p}` (a uuid unless stated)."}
        root["required"].append(p)
    if entry.get("query_schema"):
        q = _merge_defs(root, entry["query_schema"])
        for name, prop in (q.get("properties") or {}).items():
            root["properties"].setdefault(name, prop)
        for r in q.get("required") or []:
            if r not in root["required"]:
                root["required"].append(r)
    for name in entry.get("query_args") or []:
        root["properties"].setdefault(name, {"type": "string", "description": f"Query parameter `{name}`."})
    if entry.get("body_schema"):
        b = _merge_defs(root, entry["body_schema"])
        root["properties"]["body"] = b
        if b.get("required"):
            root["required"].append("body")
    if not root["required"]:
        root.pop("required")
    if not entry["is_read"]:
        # writes are strict: an unknown top-level key is an error, not silently dropped
        root["additionalProperties"] = False
    _strip_server_owned(root)
    return root


# Fields the server sets from the caller's identity. Removed from every schema
# (and from every input at execution) so a model can never attribute a record
# to someone else.
SERVER_OWNED = {"created_by_uuid"}


def _strip_server_owned(node):
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            for f in SERVER_OWNED:
                props.pop(f, None)
            if isinstance(node.get("required"), list):
                node["required"] = [r for r in node["required"] if r not in SERVER_OWNED]
        for v in node.values():
            _strip_server_owned(v)
    elif isinstance(node, list):
        for v in node:
            _strip_server_owned(v)


def _strip_args(value):
    if isinstance(value, dict):
        return {k: _strip_args(v) for k, v in value.items() if k not in SERVER_OWNED}
    if isinstance(value, list):
        return [_strip_args(v) for v in value]
    return value


def _describe(entry: dict) -> str:
    resource = entry["blueprint"].replace("_", " ")
    head = f"{entry['method']} {entry['path']} — {resource}."
    doc = (entry.get("doc") or "").strip()
    if doc:
        # first paragraph is enough for search + choice; keep descriptions bounded
        doc = doc.split("\n\n")[0].replace("\n", " ")
        head += " " + doc[:600]
    elif entry["path"].endswith("/") and not entry["path_params"]:
        head += f" Lists {resource} records (paginated: page, per_page ≤ 100)."
    elif entry["path_params"] == ["uuid"]:
        head += f" Gets one {resource} by uuid."
    filters = sorted(set((entry.get("query_schema") or {}).get("properties", {})) | set(entry.get("query_args") or []))
    filters = [f for f in filters if f not in ("page", "per_page")]
    if filters:
        head += " Filters: " + ", ".join(filters) + "."
    return head


def endpoint_tools(me: dict, include_writes: bool = False) -> list[ToolSpec]:
    from .actions import EXCLUDED_WRITE_BLUEPRINTS, STRONG, risk

    tools = []
    for e in load_catalog():
        if not e["is_read"] and (not include_writes or e["blueprint"] in EXCLUDED_WRITE_BLUEPRINTS):
            continue
        if not permitted(e, me):
            continue
        tier = risk(e)
        desc = _describe(e)
        if tier != "read":
            desc += (" WRITE: the user is shown a confirmation and must approve it"
                     + (" by typing CONFIRM (money/stock/delete)." if tier == STRONG else "."))
        tools.append(ToolSpec(
            name=e["name"], description=desc, input_schema=endpoint_input_schema(e),
            deferred=True, is_read=e["is_read"], entry=e, risk=tier,
        ))
    return tools


# --------------------------------------------------------------------------- execution

def trim(value, depth=0):
    """Drop what costs tokens and carries no information: heavy geometry, null
    fields (absent = null), and `is_deleted: false` (lists only return live rows)."""
    if isinstance(value, dict):
        return {k: trim(v, depth + 1) for k, v in value.items()
                if k not in DROP_KEYS and v is not None and not (k == "is_deleted" and v is False)}
    if isinstance(value, list):
        return [trim(v, depth + 1) for v in value]
    return value


def to_text(value) -> str:
    text = json.dumps(trim(value), ensure_ascii=False, default=str, separators=(",", ":"))
    if len(text) > MAX_RESULT_CHARS:
        text = text[:MAX_RESULT_CHARS] + (
            f'… [truncated: {len(text)} chars total. Use smaller per_page, filters, '
            f'or query_data to aggregate instead of reading raw rows.]'
        )
    return text


def call_endpoint(client: KarmaClient, entry: dict, args: dict, idempotency_key: str | None = None):
    args = dict(args or {})
    path = fill_path(entry["path"], {p: args.pop(p, None) for p in entry["path_params"]})
    body = args.pop("body", None)
    if entry["method"] == "GET":
        return client.request("GET", path, params=args)
    if body is None:
        body = args or None
    return client.request(entry["method"], path, params=None, body=body, idempotency_key=idempotency_key)


def _deny_all(_request) -> bool:
    return False


class Executor:
    """Executes tool calls for one user. The only place a call reaches the API.

    Writes run only when `allow_writes` is on AND the `confirm` callback — which
    shows the user a plain-language description and waits for their answer —
    returns True. The default callback denies everything, so a harness that has
    no way to ask the user can never write.
    """

    def __init__(self, client: KarmaClient, tools: list[ToolSpec], allow_writes: bool = False,
                 confirm=_deny_all):
        self.client = client
        self.by_name = {t.name: t for t in tools}
        self.allow_writes = allow_writes
        self.confirm = confirm
        self.endpoints = {t.name: t.entry for t in tools if t.entry}
        self.log: list[dict] = []
        self._resolver = None
        # where charts go (the agent points this at the client's callback each turn)
        self.on_chart = lambda spec: None
        # audit hook: called once per proposed write with what was shown, the
        # user's decision and the API's answer (server.py stores it)
        self.on_action = lambda record: None
        # whole-list fetches reused for a couple of minutes (joins.load); cleared on every write
        self.list_cache: dict = {}

    @property
    def resolver(self):
        from .actions import NameResolver
        if self._resolver is None:
            self._resolver = NameResolver(self.client, load_catalog())
        return self._resolver

    def _write(self, spec: ToolSpec, args: dict, call_id: str | None) -> tuple[str, bool]:
        from .actions import describe, validate

        args = _strip_args(args or {})
        errors = validate(spec.input_schema, args)
        if errors:
            self.log.append({"tool": spec.name, "args": args, "ok": False, "invalid": errors})
            return ("Not sent — the input does not match this endpoint's schema, so the user was not asked:\n- "
                    + "\n- ".join(errors)), True
        request = describe(spec.entry, args, self.resolver)
        request.tier = spec.risk
        approved = bool(self.confirm(request))
        self.log.append({"tool": spec.name, "args": args, "confirm": request.render(), "approved": approved})
        record = {"tier": request.tier, "method": request.method, "path": request.path,
                  "title": request.title + (f" — {request.target}" if request.target else ""),
                  "summary": list(request.lines), "body": args,
                  "decision": "approved" if approved else "declined", "status_code": None, "error": None}
        if not approved:
            self._audit(record)
            return ("The user DECLINED this action; nothing was changed. Do not retry it unless the user "
                    "asks again. Ask what they would like instead if it is unclear."), True
        key = None
        if call_id:
            conv = getattr(self.client, "conversation_id", None) or "x"
            key = f"assistant-{conv}-{call_id}"[:80]
        try:
            out = call_endpoint(self.client, spec.entry, args, idempotency_key=key)
        except KarmaError as e:
            self._audit({**record, "status_code": e.status, "error": (e.body or "")[:2000]})
            raise
        except Exception as e:
            self._audit({**record, "error": f"{type(e).__name__}: {e}"[:2000]})
            raise
        self._audit(record)
        self.list_cache.clear()   # the data changed: no cached list may be shown after this
        self.log[-1]["ok"] = True
        return "Done (the user confirmed). API response:\n" + to_text(out), False

    def _audit(self, record: dict):
        try:
            self.on_action(record)
        except Exception as e:  # the audit must never change what the user sees
            print(f"[assistant] audit log failed: {e}", flush=True)

    def run(self, name: str, args: dict, call_id: str | None = None, programmatic: bool = False) -> tuple[str, bool]:
        """Returns (result_text, is_error)."""
        spec = self.by_name.get(name)
        if spec is None:
            return f"Unknown tool '{name}'.", True
        if not spec.is_read:
            if not self.allow_writes:
                return ("Writes are turned off for this conversation. "
                        "Tell the user what you would do and that they can do it in the app."), True
            if programmatic:
                return "Writes cannot be made from code. Call the tool directly so the user can confirm it.", True
            try:
                return self._write(spec, args, call_id)
            except KarmaError as e:
                self.log.append({"tool": name, "args": args, "ok": False, "status": e.status})
                return f"The user confirmed, but the API refused it ({e.status}): {e.body[:1500]}", True
            except (ValueError, KeyError, TypeError) as e:
                return f"Invalid input: {e}", True
        try:
            if name in ("show_chart", "show_map"):
                from . import charts, maps
                mod = charts if name == "show_chart" else maps
                spec = mod.build(self, args)
                self.on_chart(spec)
                self.log.append({"tool": name, "args": args, "ok": True})
                return mod.summary_for_model(spec), False
            from . import toolkit
            if name in toolkit.TOOLS:
                out = toolkit.TOOLS[name][2](self, args)
            elif name == "query_data":
                out = qd.run(self, args)
            elif name == "fetch_all":
                out = qd.fetch_all(self, args.get("endpoint"), args.get("params") or {},
                                   int(args.get("max_rows") or qd.DEFAULT_MAX_ROWS))
            else:
                out = call_endpoint(self.client, spec.entry, args)
            self.log.append({"tool": name, "args": args, "ok": True})
            return to_text(out), False
        except KarmaError as e:
            self.log.append({"tool": name, "args": args, "ok": False, "status": e.status})
            return f"The API returned {e.status}: {e.body[:1500]}", True
        except (ValueError, KeyError, TypeError) as e:
            self.log.append({"tool": name, "args": args, "ok": False, "error": str(e)})
            return f"Invalid input: {e}", True


# --------------------------------------------------------------------------- harness tools

def harness_tools(endpoints: list[ToolSpec], code_calling: bool) -> list[ToolSpec]:
    from . import charts, maps

    list_endpoints = sorted(
        t.name for t in endpoints
        if t.entry and t.entry["method"] == "GET" and not t.entry["path_params"]
    ) + ["service_areas", "users"]   # virtual datasets (joins.py)
    tools = [
        ToolSpec(
            name="query_data",
            description=(
                "Analyse data across MANY records of one list endpoint without reading raw rows. "
                "The harness pages through the endpoint as the user (all pages, up to max_rows), "
                "then applies `where`, `group_by` + `aggregates`, `sort`, `fields` and `limit`, and "
                "returns only the result. Use it for totals, rankings, counts, top-N, and anything "
                "that needs more than one page. Field paths may be dotted (e.g. 'balance_per_currency.USD'). "
                "Call the endpoint once with per_page=1 first if you need to see its fields."
            ),
            input_schema=qd.INPUT_SCHEMA_TEMPLATE(list_endpoints),
            deferred=False,
        ),
        ToolSpec(
            name="show_chart",
            description=(
                "Draw a chart in the user's chat (bar, horizontal_bar, stacked_bar, line, area, pie, heatmap). Use "
                "it when a picture beats a table: trends over time, comparisons across many items, composition. "
                "heatmap = a grid of two dimensions (e.g. weekday × hour, material × month): give x for the "
                "columns, one y value and series_by for the rows. "
                "PREFER a `query` source (a query_data query + `x` + `y`, optionally `series_by`): the harness "
                "runs it and charts exactly what comes back, so the numbers are Karma's, not yours. Use "
                "`data` only to chart results you already combined from several queries. Date buckets work in "
                "group_by and x, e.g. 'created_at:month'. One currency per series; never add currencies. "
                "Max 60 points and 8 series."
            ),
            input_schema=charts.input_schema(list_endpoints),
            deferred=False,
        ),
        ToolSpec(
            name="show_map",
            description=(
                "Draw an interactive map in the user's chat. Layers: pins (one per record, coloured by `group`, "
                "sized by `value`, labelled by `label`), heat (density grid weighted by `value` or by record count), "
                "and routes (a trip's GPS track by trip_uuid, or a user's track over from_time/to_time). Records come "
                "from a `query` (any list endpoint whose rows carry 'lat,lon' coordinates: customers, trip stops…); "
                "the harness runs it as the user. Use for 'where are…', 'show on a map', clusters, coverage, routes."
            ),
            input_schema=maps.input_schema(list_endpoints),
            deferred=False,
        ),
    ]
    # Specialised helpers: loaded on demand via tool search (the system prompt
    # names them), so they don't add to every request's fixed size.
    from . import toolkit
    for tname, (desc, schema, _fn) in toolkit.TOOLS.items():
        tools.append(ToolSpec(name=tname, description=desc, input_schema=schema, deferred=True))
    if code_calling:
        tools.append(ToolSpec(
            name="fetch_all",
            description=(
                "Return ALL rows (every page, up to max_rows) of a list endpoint as a JSON array string. "
                "Only callable from code execution: use it inside Python to join and analyse several "
                "endpoints, then print a compact answer."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "endpoint": {"type": "string", "enum": list_endpoints},
                    "params": {"type": "object", "description": "Filters for the endpoint (no page/per_page)."},
                    "max_rows": {"type": "integer", "minimum": 1, "maximum": 20000},
                },
                "required": ["endpoint"],
                "additionalProperties": False,
            },
            deferred=False, code_callable=True, direct_callable=False,
        ))
    return tools
