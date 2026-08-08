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
    # The BASELINE, generated from the route decorators. Never mutated at runtime:
    # it is the floor a role falls back to, so a missing, empty or unparseable
    # override can never leave a role with no permissions at all.
    ROLE_PRESETS_BASELINE: dict = json.load(_f)


# Platform-owner overrides live in platform_setting under this key, as
# {role: {"modules": [...], "endpoints": {...}}} for OVERRIDDEN roles only —
# absent means "use the generated baseline for that role".
ROLE_PRESETS_SETTING_KEY = "role_presets"

# A role's defaults are resolved on every authenticated request (the chokepoint
# calls effective_permissions per request), so they are cached rather than read
# from the database each time. The TTL is what bounds cross-worker staleness:
# gunicorn runs several workers, each with its own cache, and the worker that
# serves the edit is not the worker that serves the next request. 30s is short
# enough that an admin sees the change take effect while they are still looking
# at the screen, and long enough that this is not a per-request query.
_ROLE_OVERRIDE_TTL_SECONDS = 30
_override_cache: dict = {"at": None, "value": {}}


def invalidate_role_overrides() -> None:
    """Drop the cached overrides so the next read hits the database.

    Called by the write path so the admin who just saved sees their own change
    immediately, rather than up to a TTL later in their own worker.
    """
    _override_cache["at"] = None


def role_overrides() -> dict:
    """Platform-owner overrides for role defaults, cached with a short TTL."""
    import time

    now = time.monotonic()
    at = _override_cache["at"]
    if at is not None and (now - at) < _ROLE_OVERRIDE_TTL_SECONDS:
        return _override_cache["value"]

    try:
        from app.adapters.unit_of_work.sqlalchemy_unit_of_work import (
            SqlAlchemyUnitOfWork,
        )
        from models.common import PlatformSetting

        with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
            row = (
                uow.session.query(PlatformSetting)
                .filter_by(key=ROLE_PRESETS_SETTING_KEY)
                .one_or_none()
            )
            value = dict(row.value) if row and row.value else {}
    except Exception:
        # This function sits on the authorization path. A settings table that is
        # unreachable mid-migration, or a row someone hand-edited into invalid
        # JSON, must NOT take the API down or silently widen access — serve the
        # last known value (falling back to the generated baseline) and move on.
        return _override_cache["value"]

    _override_cache["at"] = now
    _override_cache["value"] = value
    return value


def resolved_role_presets() -> dict:
    """Every role's effective defaults: the override where one exists, else the
    generated baseline. This is what actually governs users who follow a role."""
    overrides = role_overrides()
    return {
        role: overrides.get(role) or baseline
        for role, baseline in ROLE_PRESETS_BASELINE.items()
    }

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

# Dashboard endpoints that return only the CALLER's own records (their orders,
# their customers, their assigned stops). Self-scoped by construction, so the
# per-user resource ACL does not apply to them — a sales rep or driver without
# the `dashboard` resource grant may still read their own numbers. The account
# gates (verification, tenant feature cap) still bind; this only skips the
# per-user check. Flask endpoint names: blueprint.function.
SELF_SCOPED_DASHBOARD_ENDPOINTS = {
    "dashboard.my_revenue_over_time",
    "dashboard.my_materials_sold",
    "dashboard.my_new_customers",
    "dashboard.my_trip_stops",
}
MODULE_SET = set(MODULES)
ACTION_SET = set(ACTIONS)


# ---------------------------------------------------------------------------
# DASHBOARDS — which of the pre-defined dashboards each role may see.
#
# A separate concern from `modules`/`endpoints`, deliberately. The `dashboard`
# module answers "can this user reach the Dashboards section at all"; this map
# answers "which dashboards render inside it". Keeping it out of the module
# namespace means a dashboard never shows up as a toggle in the per-user CRUD
# checklist, and — because it resolves from the ROLE directly rather than from a
# user's frozen permissions column — a platform-owner change to a role's
# dashboards reaches every user of that role, including ones who carry a
# customised per-user ACL. Platform-wide, like ROLE_PRESETS: one config for all
# tenants, written only by the platform owner.
#
# THE CATALOG is the single place a dashboard is declared. A client renders
# whichever of these it actually ships a screen for; an id it does not recognise
# is silently ignored (never a crash), so a new dashboard added here stays
# invisible until a build ships its screen. Adding a dashboard = one entry here
# + one screen per client + its translation keys.
DASHBOARD_CATALOG = [
    {"id": "business-overview", "title_key": "dashboards.businessOverview", "order": 1},
    {"id": "profitability", "title_key": "dashboards.profitability", "order": 2},
    {"id": "revenue-over-time", "title_key": "dashboards.revenueOverTime", "order": 3},
    {"id": "customer-orders", "title_key": "dashboards.customerOrders", "order": 4},
    {"id": "new-customers", "title_key": "dashboards.newCustomers", "order": 5},
    {"id": "materials-sold", "title_key": "dashboards.materialsSold", "order": 6},
    {"id": "trip-stops", "title_key": "dashboards.tripStops", "order": 7},
    # the personal set: the same charts filtered to the signed-in user's own
    # records, backed by self-scoped endpoints any authenticated user may call
    {"id": "my-revenue", "title_key": "dashboards.myRevenue", "order": 8},
    {"id": "my-materials-sold", "title_key": "dashboards.myMaterialsSold", "order": 9},
    {"id": "my-new-customers", "title_key": "dashboards.myNewCustomers", "order": 10},
    {"id": "my-trip-stops", "title_key": "dashboards.myTripStops", "order": 11},
    {"id": "sales-performance", "title_key": "dashboards.salesPerformance", "order": 12},
    {"id": "field-ops", "title_key": "dashboards.fieldOps", "order": 13},
    {"id": "spend", "title_key": "dashboards.spend", "order": 14},
    {"id": "inventory-health", "title_key": "dashboards.inventoryHealth", "order": 15},
]
DASHBOARD_IDS = {d["id"] for d in DASHBOARD_CATALOG}
_DASHBOARD_ORDER = {d["id"]: d["order"] for d in DASHBOARD_CATALOG}

# Baseline role -> dashboard ids. An absent role sees none. admin/superuser see
# every dashboard (resolved to None below) and are never stored here. A role only
# actually reaches these if it ALSO holds the `dashboard` module (role_presets) —
# today that is accountant + operation_manager; granting a dashboard to another
# role presupposes granting it the module too.
DASHBOARD_DEFAULTS = {
    "operation_manager": ["business-overview", "profitability", "revenue-over-time", "customer-orders", "new-customers", "materials-sold", "trip-stops", "sales-performance", "field-ops", "spend", "inventory-health"],
    "accountant": ["business-overview", "profitability", "revenue-over-time", "customer-orders", "new-customers", "materials-sold", "spend"],
    "sales_manager": ["business-overview", "revenue-over-time", "customer-orders", "new-customers", "materials-sold", "trip-stops", "my-revenue", "my-materials-sold", "my-new-customers", "my-trip-stops", "sales-performance", "field-ops"],
    "sales": ["my-revenue", "my-materials-sold", "my-new-customers", "my-trip-stops", "sales-performance", "field-ops"],
    "sales_associate": ["my-revenue", "my-materials-sold", "my-new-customers", "my-trip-stops", "sales-performance", "field-ops"],
    "warehouse_keeper": ["inventory-health"],
    "operator": [],
    "driver": ["my-trip-stops"],
}

# Platform-owner overrides live in platform_setting under this key, as
# {role: [dashboard_id, ...]} for OVERRIDDEN roles only — absent means "use the
# DASHBOARD_DEFAULTS baseline for that role".
ROLE_DASHBOARDS_SETTING_KEY = "role_dashboards"
_dash_override_cache: dict = {"at": None, "value": {}}


def invalidate_role_dashboards() -> None:
    """Drop the cached dashboard overrides so the next read hits the database."""
    _dash_override_cache["at"] = None


def role_dashboard_overrides() -> dict:
    """Platform-owner overrides for role dashboards, cached with the same short
    TTL and the same authorization-path safety as role_overrides()."""
    import time

    now = time.monotonic()
    at = _dash_override_cache["at"]
    if at is not None and (now - at) < _ROLE_OVERRIDE_TTL_SECONDS:
        return _dash_override_cache["value"]

    try:
        from app.adapters.unit_of_work.sqlalchemy_unit_of_work import (
            SqlAlchemyUnitOfWork,
        )
        from models.common import PlatformSetting

        with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
            row = (
                uow.session.query(PlatformSetting)
                .filter_by(key=ROLE_DASHBOARDS_SETTING_KEY)
                .one_or_none()
            )
            value = dict(row.value) if row and row.value else {}
    except Exception:
        # same rule as role_overrides: this sits on the auth path, so a
        # transient DB problem serves the last known value rather than 500ing
        return _dash_override_cache["value"]

    _dash_override_cache["at"] = now
    _dash_override_cache["value"] = value
    return value


def resolved_role_dashboards() -> dict:
    """Every configurable role's dashboard ids: the override where one exists,
    else the baseline. Only ids still in the catalog survive, so retiring a
    dashboard cannot leave a dangling grant."""
    overrides = role_dashboard_overrides()
    out = {}
    for role in DASHBOARD_DEFAULTS:
        ids = overrides[role] if role in overrides else DASHBOARD_DEFAULTS[role]
        out[role] = [i for i in (ids or []) if i in DASHBOARD_IDS]
    return out


def dashboards_for_scope(permission_scope):
    """Ordered dashboard ids a scope may see, or None for admin/superuser (all).

    Mirrors effective_permissions' admin bypass: None means "every dashboard",
    a list means exactly these. Deduped across a comma-joined scope and ordered
    by the catalog so both clients render the same sequence.
    """
    scopes = set((permission_scope or "").split(","))
    if scopes & _ADMIN_SCOPES:
        return None
    resolved = resolved_role_dashboards()
    seen: set = set()
    out: list = []
    for s in scopes:
        for did in resolved.get(s, []):
            if did not in seen:
                seen.add(did)
                out.append(did)
    out.sort(key=lambda i: _DASHBOARD_ORDER.get(i, 999))
    return out


_ADMIN_SCOPES = {"admin", "superuser"}


def preset_for_scope(permission_scope: str | None) -> dict:
    """The role preset for a permission_scope string (may be comma-joined).
    Union of every matched role's preset. Unknown/empty scope -> empty.

    Reads the RESOLVED presets, so a platform-owner edit to a role's defaults
    takes effect for every user following that role without a deploy. Users with
    an explicit per-user override are unaffected — effective_permissions returns
    their own column and never reaches here.
    """
    presets = resolved_role_presets()
    scopes = [s.strip() for s in (permission_scope or "").split(",") if s.strip()]
    modules: set = set()
    endpoints: dict = {}
    for scope in scopes:
        preset = presets.get(scope)
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


def perms_version(scopes, user_acl, account_perms, account_verified, dashboards="__unset__") -> str:
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

    governing = {
        "scopes": sorted(s for s in (scopes or []) if s),
        "acl": user_acl,
        "account": account_perms,
        "verified": bool(account_verified),
    }
    # The set of dashboards a role sees governs visibility too, so an edit to it
    # must move the fingerprint and tell open clients to re-read. Only folded in
    # when the caller passes it (sentinel default), so a caller that predates this
    # — a test, say — keeps its old fingerprint rather than forcing a spurious
    # refresh; the one caller that matters (the request chokepoint) passes it.
    if dashboards != "__unset__":
        governing["dashboards"] = dashboards

    payload = json.dumps(
        governing, sort_keys=True, separators=(",", ":"), default=str
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
