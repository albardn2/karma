"""Derive role -> fine-grained permission presets from the ACTUAL route
decorators, so presets exactly preserve today's role access.

For every registered URL rule:
  - blueprint  = endpoint.split('.')[0]  (only RESOURCE blueprints count)
  - for each real HTTP method -> CRUD action
  - the view's recorded `_required_scopes` (from scopes_required) says which
    roles are allowed; NO scopes_required (plain @jwt_required) = all roles.

A role can perform (resource, action) if ANY route in that blueprint with the
matching method allows it. Modules preset = menu tabs whose resource the role
can READ (users/live-map/location-tracking are admin-only, excluded).

Run:  docker exec karma-backend-1 python scripts/gen_role_presets.py
Prints a Python literal to paste into permissions.py as ROLE_PRESETS.
"""
import json

from app import create_app
from app.entrypoint.routes.common.permissions import (
    METHOD_ACTIONS,
    RESOURCE_SET,
    MODULES,
)

NON_ADMIN_ROLES = ["operation_manager", "accountant", "operator", "driver", "sales"]
ADMIN_SCOPES = {"admin", "superuser"}

# menu module id -> resource blueprint it reads (admin-only modules omitted)
MODULE_RESOURCE = {
    "dashboard": "dashboard", "customers": "customer", "vendors": "vendor",
    "warehouses": "warehouse", "employees": "employee", "vehicles": "vehicle",
    "trips": "trip", "financial-accounts": "financial_account",
    "materials": "material", "pricing": "pricing", "fixed-assets": "fixed_asset",
    "inventory": "inventory", "inventory-events": "inventory_event",
    "service-areas": "service_area", "purchase-orders": "purchase_order",
    "customer-orders": "customer_order", "payments": "payment",
    "payouts": "payout", "expenses": "expense", "transactions": "transaction",
    "credit-note-items": "credit_note_item", "debit-note-items": "debit_note_item",
    "processes": "process", "workflows": "workflow",
    "workflow-execution": "workflow_execution",
    # users, live-map, location-tracking are admin-only -> not in any preset
}


def main():
    app = create_app()
    # role -> resource -> set(actions)
    grants = {r: {} for r in NON_ADMIN_ROLES}

    for rule in app.url_map.iter_rules():
        blueprint = rule.endpoint.split(".")[0]
        if blueprint not in RESOURCE_SET:
            continue
        view = app.view_functions[rule.endpoint]
        required = getattr(view, "_required_scopes", None)  # None = no scopes_required

        for method in rule.methods:
            action = METHOD_ACTIONS.get(method)
            if action is None:  # OPTIONS
                continue
            for role in NON_ADMIN_ROLES:
                if required is None:
                    allowed = True  # jwt_required only -> any authenticated role
                else:
                    rset = set(required)
                    if rset <= ADMIN_SCOPES:
                        allowed = False  # admin-only route
                    else:
                        allowed = role in rset
                if allowed:
                    grants[role].setdefault(blueprint, set()).add(action)

    presets = {}
    for role in NON_ADMIN_ROLES:
        endpoints = {
            res: sorted(acts, key=["create", "read", "update", "delete"].index)
            for res, acts in sorted(grants[role].items())
        }
        modules = sorted(
            m for m in MODULES
            if m in MODULE_RESOURCE and "read" in (endpoints.get(MODULE_RESOURCE[m], []))
        )
        presets[role] = {"modules": modules, "endpoints": endpoints}

    print(json.dumps(presets, indent=4, ensure_ascii=False))


if __name__ == "__main__":
    main()
