"""Prove the roles-as-presets change does not remove access from any existing
role user. For every route+method and every non-admin role, compare:

  OLD (legacy scopes_required for a role user):
     allow if the route has no scopes_required, or role in required_scopes.
  NEW (fine-grained, effective perms = role preset, no explicit override):
     before_request: resource route requires the preset to grant
       (blueprint, action); non-resource routes pass this layer.
     scopes_required decorator: for a fine-grained user, allow unless the
       route is admin-only (required_scopes subset of {admin,superuser}).

Reports, per role: LOST (old allow, new deny) — must be ZERO — and GAINED
(old deny, new allow) for transparency.
"""
from app import create_app
from app.entrypoint.routes.common.permissions import (
    METHOD_ACTIONS, RESOURCE_SET, ROLE_PRESETS, preset_for_scope, endpoint_allowed,
)

ADMIN = {"admin", "superuser"}
ROLES = ["operation_manager", "accountant", "operator", "driver", "sales"]
REAL_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def old_allow(role, required):
    # role user under scopes_required: no decorator => any auth user; else overlap
    if required is None:
        return True
    return role in set(required)


def new_allow(role, blueprint, method, required):
    eff = preset_for_scope(role)  # explicit=None -> role preset
    # layer 1: before_request (only gates resource blueprints)
    if blueprint in RESOURCE_SET:
        if not endpoint_allowed(eff, blueprint, method):
            return False
    # layer 2: scopes_required decorator (fine-grained user)
    if required is not None and set(required) <= ADMIN:
        return False  # admin-only stays admin-only
    return True


def main():
    app = create_app()
    routes = []
    for rule in app.url_map.iter_rules():
        blueprint = rule.endpoint.split(".")[0]
        view = app.view_functions[rule.endpoint]
        required = getattr(view, "_required_scopes", None)
        for method in rule.methods:
            if method not in REAL_METHODS:
                continue
            routes.append((rule.rule, method, blueprint, required))

    print(f"routes x methods checked: {len(routes)}\n")
    total_lost = 0
    for role in ROLES:
        lost, gained = [], []
        for path, method, bp, required in routes:
            o = old_allow(role, required)
            n = new_allow(role, bp, method, required)
            if o and not n:
                lost.append((method, path, required))
            elif n and not o:
                gained.append((method, path, bp))
        total_lost += len(lost)
        print(f"=== {role} ===  LOST={len(lost)}  GAINED={len(gained)}")
        for m, p, req in lost:
            print(f"    LOST  {m:6s} {p}  (was scoped to {req})")
        # summarize gains by blueprint+method
        gset = sorted({(bp, m) for m, p, bp in gained})
        if gset:
            print("    gained (blueprint+method, from per-endpoint granularity):")
            for bp, m in gset:
                print(f"       + {m:6s} {bp}")
    print(f"\nTOTAL LOST across all roles: {total_lost}  "
          f"({'PASS — no existing user loses access' if total_lost == 0 else 'FAIL'})")


if __name__ == "__main__":
    main()
