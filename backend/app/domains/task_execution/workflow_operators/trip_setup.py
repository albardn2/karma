"""Reading the trip setup form's result, across both generations of the form.

The setup form was rebuilt (2026-08): the manual_stops toggle became a
`strategy` select, the min/max pair became `desired_stops`, and the routing
inputs (warehouses, categories, visit threshold) left the form pending the new
routing algorithms. But executions started under the OLD form are still in
flight, and their stored results still carry the old fields — so everything
that reads the setup result goes through here, where both shapes are understood.

Strategies:
  manual         — no-op routing; the driver adds stops at the door. The only
                   strategy the new form offers until the routing revamp lands.
  legacy_cluster — the old KMeans + nearest-neighbour pipeline. Not offered on
                   the form; it exists so old routed executions resolve to the
                   path that can actually read their stored inputs.
"""
MANUAL = "manual"
LEGACY_CLUSTER = "legacy_cluster"

# grows as the routing revamp lands real algorithms; the form's strategy select
# is enriched from this at read time so the two cannot drift
FORM_STRATEGIES = (MANUAL,)


def resolve_strategy(result) -> str:
    """The routing strategy a setup result asks for, whichever form wrote it.

    New form: an explicit `strategy` value (the single-pick select may arrive
    as a one-element list). Old form: `manual_stops` decided the fork. A result
    with NEITHER key predates the manual toggle entirely (pre-2026-07) — that
    schema required the routing inputs, so such a result is a routed one and
    must resolve to the path that can read them; only a result bare of the
    routed signature too falls back to manual.
    """
    result = result or {}
    raw = result.get("strategy")
    if raw:
        if isinstance(raw, list):
            raw = raw[0] if raw else ""
        value = str(raw).strip().lower()
        if value:
            return value
    if "manual_stops" in result:
        return MANUAL if result.get("manual_stops") else LEGACY_CLUSTER
    if "start_warehouse_name" in result:
        return LEGACY_CLUSTER
    return MANUAL
