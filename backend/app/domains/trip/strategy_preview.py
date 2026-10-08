"""How many customers a strategy's priorities match, before anything is picked.

The setup form shows this under its strategy dropdown so a dispatcher can see,
before committing, whether the strategy will fill the trip or starve it.

THE PROPERTY TO PROTECT: this module contains no `if` about a customer. Every
filtering decision is a call into priority_router.candidates_for_priority. The
day it grows one, the preview has started lying and nobody will notice —
test_preview_delegates_every_filtering_decision is what says so.
"""
from datetime import datetime
from typing import Optional

from app.domains.service_area.geometry import service_area_coverage
from app.domains.task_execution.workflow_operators.trip_setup import (
    LEGACY_CLUSTER,
    MANUAL,
    load_strategy_config,
)
from app.dto.task_execution import (
    StrategyPoolPreviewRead,
    StrategyPriorityPoolCount,
)


def preview_strategy_pool(
    uow,
    strategy_name: str,
    service_area_names,
    now: Optional[datetime] = None,
) -> StrategyPoolPreviewRead:
    """The router's FILTERING stage, counted — and none of its selection stage.

    Deliberately unlike PriorityRouter.run: it never clusters, never sees
    desired_stops, never applies max_stops, and answers 0 where run() raises.
    A dispatcher who narrows the areas down to an empty region must see a
    zero — that is the whole point of the feature — not a red error.

    Each row is exact for the FIRST priority and an upper bound for the rest:
    run() excludes customers an earlier priority actually PICKED, and at
    preview time nothing has been picked. The UI says so; no caller may read
    a row as "this priority will get N".
    """
    # the one permitted Python .lower(): a built-in membership test, exactly
    # as trip_setup.resolve_strategy does it. It short-circuits BEFORE any
    # repository call, because find_by_name_ci("manual") finds nothing
    # (reserved names cannot be saved) and the dispatcher would get a 400 for
    # a perfectly correct selection.
    name = str(strategy_name or "").strip()
    if not name or name.lower() in (MANUAL, LEGACY_CLUSTER):
        return StrategyPoolPreviewRead(
            applicable=False, eligible_pool=0, total=0,
            priorities=[], overlaps=False, unmatched_service_areas=[],
        )

    # imported here, not at module scope: priority_router pulls sklearn and
    # pyproj at import time, and this module is reached from a request path
    from app.domains.trip.priority_router import candidates_for_priority

    config = load_strategy_config(uow, name)
    coverage = service_area_coverage(uow, service_area_names)
    pool = uow.customer_repository.fetch_priority_routing_pool(polygon=coverage.polygon)

    # ONE clock for the whole preview, and a NAIVE one: last_effective_stop is
    # a tz-less DateTime column and the recency filter compares against it
    # directly, so an aware datetime raises TypeError — and only for customers
    # who have actually been visited, which is why it survives every test
    # built on fresh fakes. Taken once, or two priorities straddling a recency
    # boundary answer inconsistently within one response.
    now = now or datetime.utcnow()

    rows, union, summed = [], set(), 0
    for index, priority in enumerate(config.priorities):
        matched = {c.uuid for c in candidates_for_priority(uow, pool, priority, now)}
        rows.append(StrategyPriorityPoolCount(
            index=index, count=len(matched), max_stops=priority.max_stops,
        ))
        union |= matched
        summed += len(matched)

    return StrategyPoolPreviewRead(
        applicable=True,
        eligible_pool=len(pool),
        total=len(union),
        priorities=rows,
        overlaps=summed > len(union),
        unmatched_service_areas=coverage.unmatched,
    )
