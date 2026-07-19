"""Fine-grained per-user permissions.

Non-admin users may carry a `permissions` JSON object:

    {
      "modules":   ["customers", "trips", ...],          # frontend menu tabs
      "endpoints": {"customer": ["create", "read"], ...} # per-blueprint CRUD
    }

- `modules` only drives menu visibility in the frontends.
- `endpoints` is enforced server-side at the request chokepoint
  (see app/__init__.py): for a user WITH a permissions object, access to a
  resource blueprint requires the matching CRUD action; role scopes are
  bypassed except that admin-only routes stay admin-only.
- Users WITHOUT a permissions object (legacy role users: drivers, sales...)
  keep the existing role-scope behavior untouched. Admins always have
  full access and cannot carry a permissions object.
"""

ACTIONS = ["create", "read", "update", "delete"]

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
    "dashboard", "debit_note_item", "employee", "expense",
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
    "transactions", "credit-note-items", "debit-note-items", "processes",
    "workflows", "workflow-execution", "live-map", "location-tracking",
]

RESOURCE_SET = set(RESOURCES)
MODULE_SET = set(MODULES)
ACTION_SET = set(ACTIONS)


def endpoint_allowed(permissions: dict, blueprint: str, method: str) -> bool:
    """Does this permissions object grant `method` on `blueprint`?"""
    action = METHOD_ACTIONS.get(method)
    if action is None:
        return False
    allowed = (permissions.get("endpoints") or {}).get(blueprint) or []
    return action in allowed
