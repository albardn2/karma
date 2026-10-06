"""The setup form's pool preview, and the one thing that must never drift.

The preview tells a dispatcher how many customers a strategy would consider
before they commit to it. Its only real failure mode is silent: if it ever
stops agreeing with PriorityRouter, it keeps printing a confident number that
is wrong, and nothing on screen says so.

So the load-bearing test here is test_preview_count_equals_what_the_router_
itself_considers, which drives the REAL run() and compares. Everything else
guards a specific way the two could be pulled apart.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from geoalchemy2 import WKTElement

from app.domains.trip.priority_router import PriorityRouter
from app.domains.trip.strategy_preview import preview_strategy_pool
from app.dto.routing_strategy import RoutingStrategyConfig, StrategyPriority
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError

NOW = datetime(2026, 8, 21, 12, 0, 0)


def customer(uuid, lon, lat, tags=(), category="minimarket",
             last_effective=None, debt=None):
    return SimpleNamespace(
        uuid=uuid,
        tags=list(tags),
        category=category,
        last_effective_stop=last_effective,
        balance_per_currency=debt or {"USD": 0, "SYP": 0},
        coordinates=WKTElement(f"POINT({lon} {lat})", srid=4326),
    )


POOL = [
    customer("a", 1.0, 1.0, tags=["vip"], category="minimarket", debt={"SYP": 500}),
    customer("b", 1.1, 1.0, tags=["vip", "blacklist"], category="supermarket"),
    customer("c", 1.2, 1.0, tags=["wholesale"], category="minimarket", debt={"SYP": 0}),
    customer("d", 5.0, 5.0, tags=[], category="kiosk",
             last_effective=NOW - timedelta(days=2)),
    customer("e", 5.1, 5.0, tags=["vip", "wholesale"], category="kiosk",
             last_effective=NOW - timedelta(days=40), debt={"SYP": 20}),
    customer("f", 5.2, 5.0, tags=["customer_sale:repeat_sale"], category="bakery"),
]


def fake_uow(pool=POOL, config=None, areas=None):
    """A uow whose three touched repositories behave like the real ones.

    The balance fake mirrors the repository's set-based aggregation off the
    fakes' own dicts — including the real one's habit of seeding a 0.0 for
    every requested uuid, which is what makes SMALLER_THAN match a customer
    who owes nothing.
    """
    uow = MagicMock()
    uow.customer_repository.fetch_priority_routing_pool.return_value = list(pool)

    def balances(uuids, currency):
        by_id = {c.uuid: c for c in pool}
        return {u: float(by_id[u].balance_per_currency.get(currency, 0) or 0) for u in uuids}

    uow.customer_repository.fetch_outstanding_balances.side_effect = balances
    uow.routing_strategy_repository.find_by_name_ci.return_value = (
        SimpleNamespace(name="s", config=config) if config is not None else None
    )
    uow.service_area_repository._find_all_by_filters.return_value = list(areas or [])
    return uow


def cfg(*priorities):
    return RoutingStrategyConfig(priorities=list(priorities)).model_dump(mode="json")


# --------------------------------------------------------------------------
# THE anti-drift test


FILTER_MATRIX = [
    pytest.param(StrategyPriority(), id="no-filters-catch-all"),
    pytest.param(StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}]),
                 id="legacy-flat-tag_filters"),
    pytest.param(StrategyPriority(tag_filters=[{"op": "NOT_EQUAL", "value": "blacklist"}]),
                 id="legacy-not-equal"),
    pytest.param(StrategyPriority(tag_filters=[{"op": "IS_IN", "value": ["vip", "wholesale"]}]),
                 id="legacy-is-in"),
    pytest.param(StrategyPriority(tag_filters=[{"op": "CONTAINS", "value": "sale"}]),
                 id="legacy-contains"),
    pytest.param(StrategyPriority(tag_expression={"op": "AND", "children": [
        {"op": "EQUAL", "value": "vip"}, {"op": "NOT_EQUAL", "value": "blacklist"}]}),
        id="grouped-AND"),
    pytest.param(StrategyPriority(tag_expression={"op": "OR", "children": [
        {"op": "EQUAL", "value": "vip"}, {"op": "EQUAL", "value": "wholesale"}]}),
        id="grouped-OR"),
    pytest.param(StrategyPriority(tag_expression={"op": "AND", "children": [
        {"op": "OR", "children": [{"op": "EQUAL", "value": "vip"},
                                  {"op": "EQUAL", "value": "wholesale"}]},
        {"op": "NOT_EQUAL", "value": "blacklist"}]}),
        id="grouped-nested"),
    pytest.param(StrategyPriority(category_filter={"op": "EQUAL", "value": "minimarket"}),
                 id="category-EQUAL"),
    pytest.param(StrategyPriority(category_filter={"op": "NOT_EQUAL", "value": "kiosk"}),
                 id="category-NOT_EQUAL"),
    pytest.param(StrategyPriority(category_filter={"op": "IS_IN", "value": ["kiosk", "bakery"]}),
                 id="category-IS_IN"),
    pytest.param(StrategyPriority(last_effective_stop_days=7), id="recency-7d"),
    # 'd' was visited exactly 2 days ago; days=2 puts it exactly ON the cutoff
    pytest.param(StrategyPriority(last_effective_stop_days=2), id="recency-on-the-cutoff"),
    pytest.param(StrategyPriority(debt_filter={"op": "LARGER_THAN", "amount": 0,
                                               "currency": "SYP"}),
                 id="debt-larger-than"),
    pytest.param(StrategyPriority(debt_filter={"op": "SMALLER_THAN", "amount": 100,
                                               "currency": "SYP"}),
                 id="debt-smaller-than"),
    pytest.param(StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}],
                                  category_filter={"op": "NOT_EQUAL", "value": "supermarket"},
                                  last_effective_stop_days=7,
                                  debt_filter={"op": "LARGER_THAN", "amount": 10,
                                               "currency": "SYP"}),
                 id="every-filter-at-once"),
]


@pytest.mark.parametrize("priority", FILTER_MATRIX)
def test_preview_count_equals_what_the_router_itself_considers(priority):
    """The preview's count IS the router's candidate set. Driven through the
    real run(), not through the shared helper — a test that called the helper
    on both sides would pass forever and prove nothing.

    Valid as an equality because with ONE priority, no max_stops and
    desired_stops >= len(pool), selection is provably the identity:
    cap >= len(candidates), and pick_densest_cluster returns the list
    unchanged when len(candidates) <= cap. order_stops only reorders.
    """
    config = cfg(priority)
    preview = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    try:
        ordered, _ = PriorityRouter(fake_uow(config=config)).run(
            config=RoutingStrategyConfig(**config),
            desired_stops=len(POOL),
            now=NOW,
        )
        routed = {c.uuid for c in ordered}
    except BadRequestError:
        # run() raises where the preview answers 0 — that difference is
        # deliberate and is pinned separately below
        routed = set()

    assert preview.priorities[0].count == len(routed)
    assert preview.total == len(routed)


def test_every_priority_field_is_covered_by_the_drift_matrix():
    """Adding a sixth filter field to StrategyPriority must FAIL here.

    The contract test above only catches a new filter if the matrix happens
    to exercise it. This makes the omission mechanical: whoever adds a field
    has to say which side it falls on, which is exactly the question that
    keeps the preview truthful.
    """
    selection_only = {"max_stops"}
    covered_by_matrix = {
        "tag_filters", "tag_expression", "category_filter",
        "debt_filter", "last_effective_stop_days",
    }
    assert set(StrategyPriority.model_fields) == selection_only | covered_by_matrix


# --------------------------------------------------------------------------
# the preview must not grow logic of its own


def test_preview_delegates_every_filtering_decision(monkeypatch):
    """Every row is whatever the shared helper returned — nothing else.

    Fails the moment anyone adds an `if` about a customer to the preview
    loop, which is the one way this module can start lying.
    """
    import app.domains.trip.strategy_preview as mod

    calls = []

    def stub(uow, pool, priority, now, exclude_ids=frozenset()):
        calls.append((priority, now, exclude_ids))
        return POOL[: len(calls)]

    monkeypatch.setattr(
        "app.domains.trip.priority_router.candidates_for_priority", stub,
    )
    config = cfg(StrategyPriority(), StrategyPriority(), StrategyPriority())
    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    assert [r.count for r in out.priorities] == [1, 2, 3]
    assert out.total == 3                      # deduped union of nested prefixes
    assert out.eligible_pool == len(POOL)
    # the preview never excludes anything: nothing has been picked yet
    assert all(excluded == frozenset() for _, _, excluded in calls)


def test_one_clock_for_every_priority():
    """Two priorities straddling a recency boundary must not disagree."""
    import app.domains.trip.priority_router as router_mod

    seen = []
    real = router_mod.candidates_for_priority

    def spy(uow, pool, priority, now, exclude_ids=frozenset()):
        seen.append(now)
        return real(uow, pool, priority, now, exclude_ids)

    router_mod.candidates_for_priority = spy
    try:
        config = cfg(
            StrategyPriority(last_effective_stop_days=1),
            StrategyPriority(last_effective_stop_days=30),
            StrategyPriority(),
        )
        preview_strategy_pool(fake_uow(config=config), "s", [])
    finally:
        router_mod.candidates_for_priority = real

    assert len(seen) == 3
    assert len(set(seen)) == 1, "every priority must be measured against one clock"


def test_preview_never_selects(monkeypatch):
    """No clustering, no max_stops, no desired_stops."""
    import app.domains.trip.priority_router as router_mod

    kmeans = MagicMock()
    monkeypatch.setattr(router_mod, "KMeans", kmeans)

    config = cfg(StrategyPriority(max_stops=1))
    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    kmeans.assert_not_called()
    # a filterless priority matches everyone, cap or no cap
    assert out.priorities[0].count == len(POOL)
    assert out.priorities[0].max_stops == 1


# --------------------------------------------------------------------------
# the numbers themselves


def test_total_is_the_deduped_union_not_the_sum():
    config = cfg(
        StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}]),
        StrategyPriority(),                      # catch-all: matches everyone
    )
    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    assert sum(r.count for r in out.priorities) > out.total
    assert out.total == len(POOL) == out.eligible_pool
    assert out.overlaps is True


def test_rows_that_cannot_overlap_do_not_claim_to():
    config = cfg(
        StrategyPriority(category_filter={"op": "EQUAL", "value": "minimarket"}),
        StrategyPriority(category_filter={"op": "EQUAL", "value": "kiosk"}),
    )
    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    assert out.overlaps is False
    assert out.total == sum(r.count for r in out.priorities)


def test_multi_band_preview_is_an_upper_bound():
    """A later row is >= what run() actually computes for that priority.

    run() excludes customers an EARLIER priority already picked (and breaks
    out once the budget is full); the preview excludes nothing, because at
    preview time nothing has been picked. This is the executable form of the
    claim the UI makes — a row is exact for Priority 1 and a ceiling below.
    """
    first = StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}])
    second = StrategyPriority()
    config = cfg(first, second)

    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    seen = []
    import app.domains.trip.priority_router as router_mod
    real = router_mod.candidates_for_priority

    def spy(uow, pool, priority, now, exclude_ids=frozenset()):
        got = real(uow, pool, priority, now, exclude_ids)
        seen.append(len(got))
        return got

    router_mod.candidates_for_priority = spy
    try:
        # a budget big enough that the second priority is REACHED (a smaller
        # one makes run() break out at :281-283 before it, which is the other
        # half of why a later row is only a bound — pinned below)
        PriorityRouter(fake_uow(config=config)).run(
            config=RoutingStrategyConfig(**config), desired_stops=4, now=NOW,
        )
    finally:
        router_mod.candidates_for_priority = real

    assert len(seen) == 2, "the second priority must actually have been reached"
    assert out.priorities[0].count == seen[0], "the first row is EXACT"
    assert out.priorities[1].count > seen[1], (
        "the preview counts the customers priority 1 already took; run() does not"
    )


def test_a_later_row_counts_a_priority_the_run_never_reaches():
    """The other half of "upper bound": run() stops once the budget is full.

    With desired_stops=2 and three vip customers, priority 2 is never even
    evaluated — but the preview still reports its pool, because the
    dispatcher is choosing a strategy, not reading an allocation.
    """
    config = cfg(
        StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}]),
        StrategyPriority(),
    )
    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)

    seen = []
    import app.domains.trip.priority_router as router_mod
    real = router_mod.candidates_for_priority

    def spy(uow, pool, priority, now, exclude_ids=frozenset()):
        seen.append(priority)
        return real(uow, pool, priority, now, exclude_ids)

    router_mod.candidates_for_priority = spy
    try:
        PriorityRouter(fake_uow(config=config)).run(
            config=RoutingStrategyConfig(**config), desired_stops=2, now=NOW,
        )
    finally:
        router_mod.candidates_for_priority = real

    assert len(seen) == 1, "run() broke out once the budget filled"
    assert out.priorities[1].count == len(POOL), "the preview still reports it"


def test_preview_returns_zero_where_run_raises():
    """An empty region is feedback, not an error — that is the whole point."""
    empty = preview_strategy_pool(
        fake_uow(pool=[], config=cfg(StrategyPriority())), "s", [], now=NOW,
    )
    assert (empty.eligible_pool, empty.total) == (0, 0)
    assert empty.applicable is True

    narrow = preview_strategy_pool(
        fake_uow(config=cfg(StrategyPriority(
            tag_filters=[{"op": "EQUAL", "value": "nobody-has-this"}]))),
        "s", [], now=NOW,
    )
    assert narrow.eligible_pool == len(POOL)
    assert narrow.total == 0
    assert [r.count for r in narrow.priorities] == [0]


def test_debt_is_batched_once_per_debt_priority():
    """One narrowed aggregation per debt priority — never per customer, and
    never hoisted to one call over the whole pool (that would be a second
    code path only the preview uses)."""
    config = cfg(
        StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}],
                         debt_filter={"op": "LARGER_THAN", "amount": 0, "currency": "SYP"}),
        StrategyPriority(),                       # no debt filter
        StrategyPriority(debt_filter={"op": "LARGER_THAN", "amount": 0, "currency": "USD"}),
    )
    uow = fake_uow(config=config)
    preview_strategy_pool(uow, "s", [], now=NOW)

    calls = uow.customer_repository.fetch_outstanding_balances.call_args_list
    assert len(calls) == 2
    # the first is the TAG-NARROWED set, not the whole pool
    assert set(calls[0].args[0]) == {"a", "b", "e"}
    assert calls[0].args[1] == "SYP"
    assert calls[1].args[1] == "USD"


def test_a_smaller_than_debt_filter_matches_zero_balance_customers():
    """Defined behaviour, pinned so nobody "fixes" it: the repository seeds
    0.0 for every requested uuid, so owing nothing is less than any positive
    threshold."""
    config = cfg(StrategyPriority(
        debt_filter={"op": "SMALLER_THAN", "amount": 100, "currency": "SYP"}))
    out = preview_strategy_pool(fake_uow(config=config), "s", [], now=NOW)
    # everyone except 'a' (500) is under 100; 'e' owes 20, the rest owe nothing
    assert out.priorities[0].count == len(POOL) - 1


# --------------------------------------------------------------------------
# resolution of the inputs


@pytest.mark.parametrize("name", ["manual", "MANUAL", " Manual ", "legacy_cluster", ""])
def test_builtin_strategies_short_circuit(name):
    """No repository call at all — find_by_name_ci('manual') finds nothing
    (reserved names cannot be saved) and would 400 a correct selection."""
    uow = fake_uow(config=None)
    out = preview_strategy_pool(uow, name, ["anywhere"], now=NOW)

    assert out.applicable is False
    assert (out.total, out.eligible_pool) == (0, 0)
    uow.routing_strategy_repository.find_by_name_ci.assert_not_called()
    uow.customer_repository.fetch_priority_routing_pool.assert_not_called()


def test_a_deleted_strategy_is_a_clear_error_not_a_zero():
    """Zero means "nobody matches"; a vanished strategy must not look like it."""
    uow = fake_uow(config=None)   # find_by_name_ci -> None
    with pytest.raises(BadRequestError) as e:
        preview_strategy_pool(uow, "gone", [], now=NOW)
    assert "no longer exists" in str(e.value)


def test_no_areas_picked_means_everywhere():
    config = cfg(StrategyPriority())
    uow = fake_uow(config=config)
    preview_strategy_pool(uow, "s", [], now=NOW)
    uow.customer_repository.fetch_priority_routing_pool.assert_called_once_with(polygon=None)
