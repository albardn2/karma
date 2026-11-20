"""Write actions: risk tiers, input validation and plain-language confirmations.

Nothing here decides whether a write is ALLOWED — the API's chokepoint does
that with the user's own token. This module makes sure nothing is written
without the user seeing exactly what will happen and saying yes:

  1. the model's input is validated against the endpoint's schema first, so the
     user is never asked to confirm something that cannot succeed;
  2. every uuid is resolved to a name (as the user), and an update shows a
     before → after diff against the current record;
  3. the harness asks the user through a confirm callback. Ordinary writes need
     a yes; money, stock movements and deletes need a deliberate CONFIRM.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from jsonschema import Draft202012Validator

from .karma_client import KarmaError, fill_path

# --------------------------------------------------------------------------- tiers

MONEY_BLUEPRINTS = {
    "payment", "payout", "transaction", "credit_note_item", "debit_note_item",
    "invoice", "invoice_item", "expense", "financial_account", "exchange_rate", "pricing",
}
# endpoint-name fragments whose effects move money or stock, or are hard to undo
STRONG_FRAGMENTS = (
    "checkout", "fulfill", "unfulfill", "cancel", "skip_and_finish", "zero_out", "manual_add",
    "audit", "unaudit", "bulk_delete", "delete", "remove", "pull", "backfill",
)
# never offered to the assistant at all
EXCLUDED_WRITE_BLUEPRINTS = {"location"}

READ, WRITE, STRONG = "read", "write", "strong"


def risk(entry: dict) -> str:
    if entry["is_read"]:
        return READ
    if entry["method"] == "DELETE" or entry["blueprint"] in MONEY_BLUEPRINTS:
        return STRONG
    view = entry["name"].split("__", 1)[-1]
    if any(f in view for f in STRONG_FRAGMENTS):
        return STRONG
    return WRITE


# --------------------------------------------------------------------------- validation

def validate(schema: dict, args: dict) -> list[str]:
    """Schema errors as short human-readable strings ([] when valid)."""
    v = Draft202012Validator(schema)
    errors = []
    for e in sorted(v.iter_errors(args), key=lambda e: list(e.path)):
        where = ".".join(str(p) for p in e.path) or "(input)"
        errors.append(f"{where}: {e.message}")
    return errors[:10]


# --------------------------------------------------------------------------- confirmation request

@dataclass
class ConfirmRequest:
    tier: str                    # write | strong
    title: str                   # "Create customer order with items and invoice"
    method: str
    path: str
    lines: list[str] = field(default_factory=list)   # plain-language details
    target: str | None = None    # the record acted on, for PUT/DELETE/actions on a uuid

    def render(self) -> str:
        head = f"{self.title}" + (f" — {self.target}" if self.target else "")
        body = "\n".join(f"  {l}" for l in self.lines) if self.lines else "  (no other details)"
        return f"{head}\n{body}\n  [{self.method} {self.path}]"


NAME_KEYS = ("company_name", "full_name", "name", "username", "plate_number", "vehicle_plate", "sku", "title")
VERBS = {"POST": "Create", "PUT": "Update", "PATCH": "Update", "DELETE": "Delete"}


def _humanize(s: str) -> str:
    return s.replace("_", " ").strip()


def _title(entry: dict) -> str:
    view = entry["name"].split("__", 1)[-1]
    resource = _humanize(entry["blueprint"])
    generic = {f"create_{entry['blueprint']}", f"update_{entry['blueprint']}", f"delete_{entry['blueprint']}",
               "create_account", "update_account", "delete_account"}
    if view in generic:
        return f"{VERBS.get(entry['method'], entry['method'])} {resource}"
    return _humanize(view).capitalize() + f" ({resource})"


class NameResolver:
    """uuid -> 'Name (1a2b3c4d)' using the user's own read access. Cached."""

    def __init__(self, client, catalog: list[dict]):
        self.client = client
        self.cache: dict[tuple, str] = {}
        self.getters = {}
        for e in catalog:
            if e["method"] == "GET" and e["path_params"] == ["uuid"] and e["path"].count("/") == 2:
                self.getters.setdefault(e["blueprint"], e)

    def record(self, blueprint: str, uuid: str) -> dict | None:
        entry = self.getters.get(blueprint)
        if not entry or not uuid:
            return None
        try:
            data = self.client.request("GET", fill_path(entry["path"], {"uuid": uuid}))
            return data if isinstance(data, dict) else None
        except (KarmaError, ValueError):
            return None

    def _describe_unnamed(self, blueprint: str, rec: dict) -> str | None:
        """Invoices, payments, orders… have no name: describe them by customer, money and status."""
        parts = []
        who = rec.get("customer_uuid")
        if who:
            parts.append(f"for {self.name('customer_uuid', who).rsplit(' (', 1)[0]}")
        elif rec.get("payer_name"):
            parts.append(f"from {str(rec['payer_name']).strip()}")
        cur = rec.get("currency") or ""
        for key, label in (("total_amount", "total"), ("amount", "amount"), ("net_amount_due", "due")):
            if isinstance(rec.get(key), (int, float)):
                parts.append(f"{label} {_fmt_value(self, key, float(rec[key]))} {cur}".strip())
        if rec.get("status"):
            parts.append(str(rec["status"]))
        if rec.get("created_at"):
            parts.append(str(rec["created_at"])[:10])
        return f"{_humanize(blueprint)} " + ", ".join(parts) if parts else None

    def name(self, field_name: str, uuid: str) -> str:
        bp = field_name[: -len("_uuid")] if field_name.endswith("_uuid") else field_name
        key = (bp, uuid)
        if key not in self.cache:
            rec = self.record(bp, uuid)
            label = None
            if rec:
                for k in NAME_KEYS:
                    if rec.get(k):
                        label = str(rec[k]).strip()
                        break
                if label is None:
                    label = self._describe_unnamed(bp, rec)
            self.cache[key] = f"{label} ({uuid[:8]})" if label else (f"{uuid} — NOT FOUND" if rec is None and bp in self.getters else uuid)
        return self.cache[key]


def _fmt_value(resolver: NameResolver, key: str, value) -> str:
    if key.endswith("_uuid") and isinstance(value, str):
        return resolver.name(key, value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _item_line(resolver: NameResolver, item: dict) -> str:
    """'10 × Sugar 50kg (ab12cd34) @ 32 = 320' for order-like items; generic otherwise."""
    qty, price = item.get("quantity"), item.get("price_per_unit")
    mat = item.get("material_uuid")
    if mat is not None and qty is not None:
        line = f"{_fmt_value(resolver, 'quantity', qty)} × {resolver.name('material_uuid', mat)}"
        if price is not None:
            line += f" @ {_fmt_value(resolver, 'price', price)} = {_fmt_value(resolver, 'total', float(qty) * float(price))}"
        rest = {k: v for k, v in item.items() if k not in ("quantity", "price_per_unit", "material_uuid") and v is not None}
        if rest:
            line += " (" + ", ".join(f"{_humanize(k)}: {_fmt_value(resolver, k, v)}" for k, v in rest.items()) + ")"
        return line
    return ", ".join(f"{_humanize(k)}: {_fmt_value(resolver, k, v)}" for k, v in item.items() if v is not None)


def describe(entry: dict, args: dict, resolver: NameResolver) -> ConfirmRequest:
    args = dict(args or {})
    path_vals = {p: args.pop(p, None) for p in entry["path_params"]}
    body = args.pop("body", None)
    if body is None and entry["method"] != "GET":
        body = args
        args = {}
    body = body or {}
    req = ConfirmRequest(tier=risk(entry), title=_title(entry), method=entry["method"],
                         path=fill_path(entry["path"], path_vals) if all(path_vals.values()) else entry["path"])

    current = None
    if path_vals.get("uuid"):
        current = resolver.record(entry["blueprint"], path_vals["uuid"])
        req.target = resolver.name(f"{entry['blueprint']}_uuid", path_vals["uuid"])

    if entry["method"] in ("PUT", "PATCH") and current is not None:
        for k, new in body.items():
            old = current.get(k)
            if old != new:
                req.lines.append(f"{_humanize(k)}: {_fmt_value(resolver, k, old) if old is not None else '—'} → "
                                 f"{_fmt_value(resolver, k, new)}")
        if not req.lines:
            req.lines.append("(no field actually changes)")
        return req

    totals: dict[str, float] = {}
    for k, v in body.items():
        if v is None:
            continue
        if isinstance(v, list) and v and isinstance(v[0], dict):
            req.lines.append(f"{_humanize(k)}:")
            for item in v:
                req.lines.append(f"  - {_item_line(resolver, item)}")
                if item.get("quantity") is not None and item.get("price_per_unit") is not None:
                    cur = body.get("currency", "")
                    totals[cur] = totals.get(cur, 0.0) + float(item["quantity"]) * float(item["price_per_unit"])
        elif isinstance(v, list):
            req.lines.append(f"{_humanize(k)}: {', '.join(_fmt_value(resolver, k, x) for x in v) or '(none)'}")
        else:
            req.lines.append(f"{_humanize(k)}: {_fmt_value(resolver, k, v)}")
    for cur, total in totals.items():
        req.lines.append(f"TOTAL: {_fmt_value(resolver, 'total', round(total, 2))} {cur}".rstrip())
    if entry["method"] == "DELETE" and current is not None:
        summary = {k: current.get(k) for k in ("amount", "currency", "status", "net_amount_due") if current.get(k) is not None}
        if summary:
            req.lines.append("record: " + ", ".join(f"{k} {v}" for k, v in summary.items()))
    return req
