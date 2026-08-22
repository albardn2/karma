"""The priority router: filters, per-priority caps, and the walk itself.

Pure-Python by design — the filter engine and the selection walk take
customer-like objects, so the whole algorithm is testable without a database.
The only fake needed is a uow whose customer_repository returns the pool.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from geoalchemy2 import WKTElement

from app.domains.trip.priority_router import (
    PriorityRouter,
    category_filter_matches,
    customer_matches_priority,
    debt_filter_matches,
    last_effective_stop_passes,
    order_stops,
    pick_densest_cluster,
    tag_filter_matches,
)
from app.dto.routing_strategy import (
    CategoryFilterOp,
    DebtFilterOp,
    RoutingStrategyConfig,
    StrategyPriority,
    TagFilterOp,
)
from app.entrypoint.routes.common.errors import BadRequestError

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


def router_for(pool):
    uow = MagicMock()
    uow.customer_repository.fetch_priority_routing_pool.return_value = pool

    # mirror the repository's set-based balance aggregation off the fakes'
    # balance dicts — the router must batch-load, never walk per customer
    def balances(uuids, currency):
        by_id = {c.uuid: c for c in pool}
        return {u: float(by_id[u].balance_per_currency.get(currency, 0) or 0) for u in uuids}

    uow.customer_repository.fetch_outstanding_balances.side_effect = balances
    return PriorityRouter(uow)


def config(*priorities):
    return RoutingStrategyConfig(priorities=list(priorities))


# --- pool eligibility ---------------------------------------------------------

def test_every_stop_status_is_classified_as_finished_or_blocking():
    """The pool excludes customers with an UNFINISHED stop, expressed as "not
    in the finished set" — so a status added later blocks by default instead of
    silently letting a customer be double-booked onto a second trip. This test
    fails when someone adds a status without deciding which side it is on."""
    from app.dto.trip_stop import FINISHED_TRIP_STOP_STATUSES, TripStopStatus

    finished = set(FINISHED_TRIP_STOP_STATUSES)
    blocking = {s.value for s in TripStopStatus} - finished
    assert finished == {"completed", "skipped", "cancelled"}
    # planned = not started yet, in_progress = being worked; both mean the
    # customer is already scheduled somewhere (manual stops are born
    # in_progress, so they block too)
    assert blocking == {"planned", "in_progress"}


# --- the filter engine --------------------------------------------------------

def test_tag_equal_and_not_equal_are_case_insensitive_whole_tag_matches():
    tags = ["customer_sale:repeated_sale", "VIP"]
    assert tag_filter_matches(tags, TagFilterOp.EQUAL, "vip")
    assert tag_filter_matches(tags, TagFilterOp.EQUAL, "customer_sale:repeated_sale")
    assert not tag_filter_matches(tags, TagFilterOp.EQUAL, "customer_sale")  # not a whole tag
    assert tag_filter_matches(tags, TagFilterOp.NOT_EQUAL, "blacklist")
    assert not tag_filter_matches(tags, TagFilterOp.NOT_EQUAL, "vip")


def test_tag_is_in_matches_any_of_the_list():
    tags = ["customer_interest:interested"]
    assert tag_filter_matches(tags, TagFilterOp.IS_IN, ["blacklist", "customer_interest:interested"])
    assert not tag_filter_matches(tags, TagFilterOp.IS_IN, ["blacklist", "agent"])


def test_tag_contains_is_a_substring_match():
    """CONTAINS is how one filter catches a whole key family."""
    tags = ["customer_sale:one_time_sale"]
    assert tag_filter_matches(tags, TagFilterOp.CONTAINS, "customer_sale")
    assert tag_filter_matches(tags, TagFilterOp.CONTAINS, "one_time")
    assert not tag_filter_matches(tags, TagFilterOp.CONTAINS, "repeated")


def test_tag_filters_on_an_untagged_customer():
    assert not tag_filter_matches([], TagFilterOp.EQUAL, "vip")
    assert tag_filter_matches([], TagFilterOp.NOT_EQUAL, "vip")
    assert not tag_filter_matches(None, TagFilterOp.CONTAINS, "vip")


def test_category_ops():
    assert category_filter_matches("minimarket", CategoryFilterOp.EQUAL, "Minimarket")
    assert category_filter_matches("roastery", CategoryFilterOp.NOT_EQUAL, "minimarket")
    assert category_filter_matches("school", CategoryFilterOp.IS_IN, ["school", "university"])
    assert not category_filter_matches("hospital", CategoryFilterOp.IS_IN, ["school"])


def test_debt_ops_compare_one_currency_only():
    balances = {"USD": 150.0, "SYP": 0.0}
    assert debt_filter_matches(balances, DebtFilterOp.LARGER_THAN, 100, "USD")
    assert not debt_filter_matches(balances, DebtFilterOp.LARGER_THAN, 100, "SYP")
    assert debt_filter_matches(balances, DebtFilterOp.SMALLER_THAN, 1, "SYP")
    # "debt exists" is LARGER_THAN 0
    assert debt_filter_matches(balances, DebtFilterOp.LARGER_THAN, 0, "USD")


def test_last_effective_stop_threshold():
    # visited 3 days ago, threshold 7 → too recent, excluded
    assert not last_effective_stop_passes(NOW - timedelta(days=3), 7, NOW)
    # visited 10 days ago, threshold 7 → passes
    assert last_effective_stop_passes(NOW - timedelta(days=10), 7, NOW)
    # never effectively visited → always passes
    assert last_effective_stop_passes(None, 7, NOW)
    # no threshold configured → always passes
    assert last_effective_stop_passes(NOW, None, NOW)


def test_priority_filters_are_anded():
    prio = StrategyPriority(
        tag_filters=[{"op": "EQUAL", "value": "vip"}],
        category_filter={"op": "EQUAL", "value": "minimarket"},
        last_effective_stop_days=7,
    )
    good = customer("c1", 36.28, 33.51, tags=["vip"], category="minimarket")
    assert customer_matches_priority(good, prio, NOW)
    wrong_tag = customer("c2", 36.28, 33.51, tags=[], category="minimarket")
    assert not customer_matches_priority(wrong_tag, prio, NOW)
    wrong_cat = customer("c3", 36.28, 33.51, tags=["vip"], category="school")
    assert not customer_matches_priority(wrong_cat, prio, NOW)
    too_recent = customer("c4", 36.28, 33.51, tags=["vip"], category="minimarket",
                          last_effective=NOW - timedelta(days=1))
    assert not customer_matches_priority(too_recent, prio, NOW)


def test_an_empty_priority_is_a_catch_all():
    prio = StrategyPriority()
    assert customer_matches_priority(customer("c1", 36.0, 33.0), prio, NOW)


# --- selection ---------------------------------------------------------------

def test_densest_cluster_wins():
    """Two neighbourhoods, one tight and one spread out: the tight one is the
    trip. cap smaller than either group trims to nearest-the-centroid."""
    tight = [customer(f"t{i}", 36.280 + i * 0.0001, 33.510) for i in range(4)]
    spread = [customer(f"s{i}", 36.4 + i * 0.05, 33.6 + i * 0.05) for i in range(4)]
    chosen = pick_densest_cluster(tight + spread, cap=4)
    assert {c.uuid for c in chosen} == {"t0", "t1", "t2", "t3"}


def test_a_full_cluster_beats_a_tighter_but_smaller_one():
    """A priority asked for cap customers: a tiny ultra-tight pair must not
    starve it when a full-size neighbourhood exists (the legacy
    sum-of-distances score had exactly that bias)."""
    pair = [customer(f"p{i}", 36.280 + i * 0.00001, 33.510) for i in range(2)]
    five = [customer(f"f{i}", 36.400 + i * 0.001, 33.600) for i in range(5)]
    chosen = pick_densest_cluster(pair + five, cap=3)
    assert len(chosen) == 3
    assert all(c.uuid.startswith("f") for c in chosen)


def test_a_cap_of_one_still_picks_from_the_dense_pocket():
    """cap=1 used to make every KMeans cluster a singleton: all spreads 0.0,
    so the "densest" pick was whichever point got label 0 — and because later
    priorities anchor on what is already picked, that coin flip dragged the
    whole trip (a 134km route where a 0.7km one was available).

    Asserted over several input orderings: the old scoring got this right only
    by luck, and luck runs out."""
    pocket = [(36.2800 + i * 0.0002, 33.5100) for i in range(6)]
    outliers = [(36.60, 33.90), (36.05, 33.20), (36.75, 33.05)]
    for rotation in range(len(pocket) + len(outliers)):
        points = pocket + outliers
        points = points[rotation:] + points[:rotation]
        cands = [customer(f"c{i}", lon, lat) for i, (lon, lat) in enumerate(points)]
        picked = pick_densest_cluster(cands, cap=1)
        assert len(picked) == 1
        lon, lat = points[[c.uuid for c in cands].index(picked[0].uuid)]
        assert (lon, lat) in pocket, (
            f"rotation {rotation} picked the outlier {(lon, lat)} instead of a "
            "dense-pocket customer"
        )


def test_cluster_returns_everyone_when_under_cap():
    few = [customer("a", 36.0, 33.0), customer("b", 36.5, 33.5)]
    assert pick_densest_cluster(few, cap=10) == few


def test_order_stops_is_a_nearest_neighbour_chain():
    line = [customer("a", 36.10, 33.50), customer("c", 36.30, 33.50),
            customer("b", 36.20, 33.50), customer("d", 36.40, 33.50)]
    ordered = [c.uuid for c in order_stops(line)]
    # a chain along the line, whichever end it starts from
    assert ordered in (["a", "b", "c", "d"], ["d", "c", "b", "a"],
                       ["b", "a", "c", "d"], ["c", "d", "b", "a"],
                       ["b", "c", "d", "a"], ["c", "b", "a", "d"])
    # no teleporting: consecutive stops are adjacent on the line
    idx = {"a": 0, "b": 1, "c": 2, "d": 3}
    hops = [abs(idx[ordered[i]] - idx[ordered[i + 1]]) for i in range(3)]
    assert max(hops) <= 2


# --- the priority walk ---------------------------------------------------------

def test_walk_fills_desired_stops_across_priorities_without_duplicates():
    vips = [customer(f"v{i}", 36.28 + i * 0.001, 33.51, tags=["vip"]) for i in range(2)]
    rest = [customer(f"r{i}", 36.281 + i * 0.001, 33.511) for i in range(5)]
    cfg = config(
        StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}]),
        StrategyPriority(),  # catch-all
    )
    ordered, waypoints = router_for(vips + rest).run(cfg, desired_stops=4)
    ids = [c.uuid for c in ordered]
    assert len(ids) == 4
    assert len(set(ids)) == 4
    # both vips picked by prio 1 (only 2 match), the rest topped up by prio 2
    assert {"v0", "v1"} <= set(ids)
    assert len(waypoints) == 4
    # waypoints are (lat, lon)
    assert all(33 < lat < 34 and 36 < lon < 37 for lat, lon in waypoints)


def test_per_priority_max_stops_caps_the_contribution():
    vips = [customer(f"v{i}", 36.28 + i * 0.0001, 33.51, tags=["vip"]) for i in range(5)]
    rest = [customer(f"r{i}", 36.29 + i * 0.0001, 33.52) for i in range(5)]
    cfg = config(
        StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}], max_stops=2),
        StrategyPriority(tag_filters=[{"op": "NOT_EQUAL", "value": "vip"}]),
    )
    ordered, _ = router_for(vips + rest).run(cfg, desired_stops=4)
    ids = {c.uuid for c in ordered}
    assert len([i for i in ids if i.startswith("v")]) == 2
    assert len([i for i in ids if i.startswith("r")]) == 2


def test_a_later_catch_all_may_re_include_a_capped_population():
    """max_stops caps what a PRIORITY contributes, not a customer's later
    eligibility: a catch-all that matches everyone can pick more vips when
    they are the nearest remaining candidates."""
    vips = [customer(f"v{i}", 36.28 + i * 0.0001, 33.51, tags=["vip"]) for i in range(5)]
    rest = [customer(f"r{i}", 36.29 + i * 0.0001, 33.52) for i in range(5)]
    cfg = config(
        StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}], max_stops=2),
        StrategyPriority(),  # matches the remaining vips too, and they are nearest
    )
    ordered, _ = router_for(vips + rest).run(cfg, desired_stops=4)
    ids = {c.uuid for c in ordered}
    assert len(ids) == 4
    assert len([i for i in ids if i.startswith("v")]) == 4


def test_desired_stops_is_the_hard_total():
    pool = [customer(f"c{i}", 36.28 + i * 0.0001, 33.51) for i in range(10)]
    ordered, _ = router_for(pool).run(config(StrategyPriority()), desired_stops=3)
    assert len(ordered) == 3


def test_fewer_matches_than_desired_is_fine():
    pool = [customer("only", 36.28, 33.51, tags=["vip"])]
    cfg = config(StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}]))
    ordered, _ = router_for(pool).run(cfg, desired_stops=10)
    assert [c.uuid for c in ordered] == ["only"]


def test_nothing_matching_fails_loudly():
    pool = [customer("c1", 36.28, 33.51)]
    cfg = config(StrategyPriority(tag_filters=[{"op": "EQUAL", "value": "vip"}]))
    with pytest.raises(BadRequestError):
        router_for(pool).run(cfg, desired_stops=5)


def test_empty_pool_fails_loudly():
    with pytest.raises(BadRequestError):
        router_for([]).run(config(StrategyPriority()), desired_stops=5)


def test_desired_stops_is_required():
    with pytest.raises(BadRequestError):
        router_for([customer("c1", 36.28, 33.51)]).run(config(StrategyPriority()), desired_stops=None)


def test_debt_priority_filters_on_batch_balances():
    debtor = customer("debtor", 36.28, 33.51, debt={"USD": 500.0, "SYP": 0})
    clean = customer("clean", 36.281, 33.511)
    cfg = config(StrategyPriority(
        debt_filter={"op": "LARGER_THAN", "amount": 100, "currency": "USD"},
    ))
    ordered, _ = router_for([debtor, clean]).run(cfg, desired_stops=5)
    assert [c.uuid for c in ordered] == ["debtor"]


def test_debt_balances_are_batch_loaded_for_the_narrowed_candidates_only():
    """One aggregation call per debt priority, scoped to the candidates the
    cheap filters already passed — never a per-customer walk of the pool."""
    debtor = customer("debtor", 36.28, 33.51, tags=["vip"], debt={"SYP": 900.0})
    other_vip = customer("v2", 36.281, 33.511, tags=["vip"])
    non_vip = customer("plain", 36.30, 33.52, debt={"SYP": 900.0})
    router = router_for([debtor, other_vip, non_vip])
    cfg = config(StrategyPriority(
        tag_filters=[{"op": "EQUAL", "value": "vip"}],
        debt_filter={"op": "LARGER_THAN", "amount": 0, "currency": "SYP"},
    ))
    ordered, _ = router.run(cfg, desired_stops=5)
    assert [c.uuid for c in ordered] == ["debtor"]
    fetch = router._uow.customer_repository.fetch_outstanding_balances
    assert fetch.call_count == 1
    called_uuids, called_currency = fetch.call_args[0]
    # only the tag-narrowed candidates, not the whole pool
    assert sorted(called_uuids) == ["debtor", "v2"]
    assert called_currency == "SYP"
