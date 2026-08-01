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
Prints JSON to paste into role_presets.json, which is the BASELINE that a
platform-owner role override falls back to.
"""
import json

from app import create_app
from app.entrypoint.routes.common.permissions import (
    METHOD_ACTIONS,
    RESOURCE_SET,
    MODULES,
)

NON_ADMIN_ROLES = ["operation_manager", "accountant", "operator", "driver", "sales"]

# Roles that carry another role's grants verbatim.
#
# The effective gate for a non-admin is the PRESET, not the decorator: once
# before_request has checked the endpoint grant, scopes_required waves a
# fine-grained caller through anything that is not admin-only (see
# routes/common/auth.py). So giving a new role the same access as an existing one
# means copying its preset — NOT naming it in all 83 `scopes_required(..., SALES)`
# decorators, which would be a large diff with no behavioural difference.
#
# sales_associate and sales_manager both start as sales. They are separate roles so
# that their permissions can diverge without renaming anyone's account, but nothing
# here pretends to know how yet. Note in particular that "a manager sees the team's
# trips" is NOT achievable by a preset: the ownership filter in
# workflow_execution/routes.py keys off is_admin, so any non-admin sees only their
# own trips regardless of role.
ROLE_ALIASES = {
    "sales_associate": "sales",
    "sales_manager": "sales",
}

# Roles whose grants are stated OUTRIGHT rather than derived from the decorators.
#
# Deriving does not work for a deliberately narrow role. 15 blueprints have at least
# one route carrying no `scopes_required` at all — customer, payment, invoice,
# expense, vendor among them — and the derivation above reads a missing decorator as
# "any authenticated role", so a warehouse-only role would silently inherit access to
# money and customer data no matter which decorators named it.
#
# The preset IS the runtime gate (before_request checks it, and scopes_required waves
# a fine-grained caller through anything not admin-only), so writing a narrower
# preset here genuinely restricts the role rather than merely describing it.
#
# warehouse_keeper — أمين مستودع — handles stock and nothing else: no customers, no
# orders, no trips, no payments, no ledger.
ROLE_OVERRIDES = {
    "warehouse_keeper": {
        "warehouse": ["create", "read", "update"],
        "inventory": ["create", "read", "update"],
        "inventory_event": ["create", "read", "update"],
        "vehicle_inventory": ["read"],
        "vehicle_inventory_event": ["create", "read"],
        # read-only on what stock is ABOUT: they count and move it, they do not
        # define materials or raise purchase orders
        "material": ["read"],
        "purchase_order": ["read"],
        "purchase_order_item": ["read"],
        "quality_control": ["create", "read"],
        "process": ["read"],
    },
}
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
    "exchange-rates": "exchange_rate",
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

    for alias, source in ROLE_ALIASES.items():
        presets[alias] = json.loads(json.dumps(presets[source]))

    for role, endpoints in ROLE_OVERRIDES.items():
        # modules derive from the endpoints, exactly as for a generated role, so the
        # sidebar a user sees matches what the API will actually answer
        presets[role] = {
            "modules": sorted(
                m for m in MODULES
                if m in MODULE_RESOURCE and "read" in endpoints.get(MODULE_RESOURCE[m], [])
            ),
            "endpoints": {k: endpoints[k] for k in sorted(endpoints)},
        }

    print(json.dumps(dict(sorted(presets.items())), indent=4, ensure_ascii=False))


if __name__ == "__main__":
    main()
