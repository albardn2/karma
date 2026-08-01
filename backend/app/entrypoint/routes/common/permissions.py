"""Fine-grained per-user permissions — the source of truth for non-admin
authorization.

Every non-admin user has an EFFECTIVE permissions object:

    {
      "modules":   ["customers", "trips", ...],          # frontend menu tabs
      "endpoints": {"customer": ["create", "read"], ...} # per-blueprint CRUD
    }

- If the user has an explicit `permissions` column it is used as-is.
- Otherwise their role (permission_scope) expands to a preset from
  ROLE_PRESETS below. Roles are simply named shortcuts for a pre-defined
  set of fine-grained permissions; the fine-grained set is what's enforced.
- `endpoints` is enforced server-side at the request chokepoint
  (see app/__init__.py): access to a resource blueprint requires the
  matching CRUD action. `modules` drives menu visibility in the frontends.
- Admins (admin / superuser) always have full access and carry no
  permissions object.

ROLE_PRESETS was generated from the actual route decorators
(scripts/gen_role_presets.py) so presets preserve each role's existing
access; edit role_presets.json to change a role's defaults.
"""
import json
import os

ACTIONS = ["create", "read", "update", "delete"]

_PRESETS_PATH = os.path.join(os.path.dirname(__file__), "role_presets.json")
with open(_PRESETS_PATH, encoding="utf-8") as _f:
    ROLE_PRESETS: dict = json.load(_f)

# HTTP method -> CRUD action
METHOD_ACTIONS = {
    "POST": "create",
    "GET": "read",
    "HEAD": "read",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}

# every resource blueprint that can be granted per-CRUD (all registered
# blueprints except `auth` — user management stays admin-only)
RESOURCES = [
    "credit_note_item", "customer", "customer_order", "customer_order_item",
    "dashboard", "debit_note_item", "employee", "exchange_rate", "expense",
    "financial_account", "fixed_asset", "inventory", "inventory_event",
    "invoice", "invoice_item", "location", "material", "payment", "payout",
    "pricing", "process", "process_template", "purchase_order",
    "purchase_order_item", "quality_control", "service_area", "task",
    "task_execution", "transaction", "trip", "trip_stop", "vehicle",
    "vehicle_inventory", "vehicle_inventory_event", "vendor", "warehouse",
    "workflow", "workflow_execution",
]

# frontend main-menu tabs (web sidebar ids; href with the leading '/'
# stripped, '/' itself = dashboard)
MODULES = [
    "dashboard", "customers", "vendors", "warehouses", "employees", "users",
    "vehicles", "trips", "financial-accounts", "materials", "pricing",
    "fixed-assets", "inventory", "inventory-events", "service-areas",
    "purchase-orders", "customer-orders", "payments", "payouts", "expenses",
    "transactions", "exchange-rates", "credit-note-items", "debit-note-items", "processes",
    "workflows", "workflow-execution", "live-map", "location-tracking",
]

RESOURCE_SET = set(RESOURCES)
MODULE_SET = set(MODULES)
ACTION_SET = set(ACTIONS)


_ADMIN_SCOPES = {"admin", "superuser"}


def preset_for_scope(permission_scope: str | None) -> dict:
    """The role preset for a permission_scope string (may be comma-joined).
    Union of every matched role's preset. Unknown/empty scope -> empty."""
    scopes = [s.strip() for s in (permission_scope or "").split(",") if s.strip()]
    modules: set = set()
    endpoints: dict = {}
    for scope in scopes:
        preset = ROLE_PRESETS.get(scope)
        if not preset:
            continue
        modules.update(preset.get("modules", []))
        for res, acts in (preset.get("endpoints") or {}).items():
            endpoints.setdefault(res, set()).update(acts)
    return {
        "modules": sorted(modules),
        "endpoints": {r: sorted(a) for r, a in sorted(endpoints.items())},
    }


def effective_permissions(user) -> dict | None:
    """Resolve the permissions that actually govern a user:
    explicit `permissions` column if set, else the role preset. Admins get
    None (full access, no checklist)."""
    scopes = set((user.permission_scope or "").split(","))
    if scopes & _ADMIN_SCOPES:
        return None
    if getattr(user, "permissions", None):
        return user.permissions
    return preset_for_scope(user.permission_scope)


def endpoint_allowed(permissions: dict, blueprint: str, method: str) -> bool:
    """Does this permissions object grant `method` on `blueprint`?"""
    action = METHOD_ACTIONS.get(method)
    if action is None:
        return False
    allowed = (permissions.get("endpoints") or {}).get(blueprint) or []
    return action in allowed


def perms_version(scopes, user_acl, account_perms, account_verified) -> str:
    """A short fingerprint of everything that governs what a client may see.

    The server revokes access on the caller's very next request, because the
    chokepoint re-reads their row every time. The CLIENTS were the stale half:
    both fetch /auth/me exactly once per provider mount, so a menu built from a
    revoked grant survived until the app was force-quit — on a phone that is
    never force-quit, until the 14-day refresh token died.

    This is the signal that closes that gap. It rides on every response as a
    header; a client holding a different value knows to re-read /auth/me. Cheaper
    than polling and it needs no push channel.

    DERIVED, not stored, so there is no column to forget to bump and no migration:
    it is a hash of the actual governing values, so it moves when — and only when —
    one of them does. That covers a role change, a per-user checklist edit, a
    tenant feature-cap change, a verification flip, AND a role_presets.json edit
    shipped by a deploy, none of which have to know this function exists.

    hashlib rather than hash(): the builtin is salted per process, so under
    gunicorn's several workers every worker would report a different version for
    the same user and clients would refresh on every other request forever.
    """
    import hashlib

    payload = json.dumps(
        {
            "scopes": sorted(s for s in (scopes or []) if s),
            "acl": user_acl,
            "account": account_perms,
            "verified": bool(account_verified),
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
