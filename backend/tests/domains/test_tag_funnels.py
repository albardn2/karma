"""What the sale and interest funnels report, pinned on the worked example the
dashboard was asked for:

    Over the last month we created 100 customers (all start at no_sale);
    50 of them went to one-time sale and 40 of those on to repeated sale.
    So: no sale +50, one-time +10, repeated +40.

Current counts come from the customers' tags; change comes from the event
log. The two are different sources, and the subtle part is the edge of each
funnel — what counts as entering it, what counts as leaving it, and which
newcomers arrive on a step without any event saying so.
"""
from datetime import datetime

import pytest

from app.domains.customer.auto_tags import INTEREST_KEY, SALE_KEY
from app.domains.customer.tag_funnels import (
    FUNNEL_TAGS,
    GRANULARITIES,
    INTEREST_STEPS,
    MAX_OFFSET,
    SALE_STEPS,
    build_funnel,
    build_payload,
    current_values,
    resolve_period_params,
)
from app.dto.customer import PREDEFINED_CUSTOMER_TAGS


def _steps(funnel):
    return {s["value"]: s for s in funnel["steps"]}


# --- the worked example ------------------------------------------------------


def test_the_requested_example_nets_out_exactly():
    moves = [
        (None, "no_sale", 100),            # 100 created
        ("no_sale", "one_time_sale", 50),  # 50 bought once
        ("one_time_sale", "repeated_sale", 40),  # 40 of them bought again
    ]
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0), moves=moves)
    s = _steps(f)
    assert s["no_sale"]["net_change"] == 50
    assert s["one_time_sale"]["net_change"] == 10
    assert s["repeated_sale"]["net_change"] == 40
    # the arrows between the steps
    assert f["transitions"] == [
        {"from": "no_sale", "to": "one_time_sale", "count": 50},
        {"from": "one_time_sale", "to": "repeated_sale", "count": 40},
    ]
    # creation is an entry into the funnel, not a step-to-step move
    assert s["no_sale"]["entered"] == 100


def test_the_same_story_for_interest():
    """Creation writes no interest event — a new customer simply has no
    interest tag — so the newcomers arrive on Unknown via `created`."""
    moves = [
        (None, "interested", 30),
        (None, "not_interested", 20),
        ("not_interested", "interested", 5),
    ]
    f = build_funnel(INTEREST_STEPS, current=current_values([], INTEREST_KEY, 0),
                     moves=moves, created=100)
    s = _steps(f)
    assert s[None]["net_change"] == 100 - 30 - 20
    assert s["not_interested"]["net_change"] == 20 - 5
    assert s["interested"]["net_change"] == 30 + 5
    assert s[None]["entered"] == 100
    # Unknown IS a step here, so absent -> interested is a move between steps
    assert {"from": None, "to": "interested", "count": 30} in f["transitions"]


def test_created_is_ignored_by_a_funnel_without_an_unknown_step():
    """A new customer's no_sale arrives through its own (absent -> no_sale)
    event, so adding `created` on top would count every newcomer twice."""
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0),
                     moves=[(None, "no_sale", 7)], created=7)
    assert _steps(f)["no_sale"]["net_change"] == 7


# --- the edges of a funnel ---------------------------------------------------


def test_a_void_moves_a_customer_back_down_and_nets_both_steps():
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0),
                     moves=[("repeated_sale", "one_time_sale", 2)])
    s = _steps(f)
    assert s["repeated_sale"]["net_change"] == -2
    assert s["one_time_sale"]["net_change"] == 2
    assert f["transitions"] == [{"from": "repeated_sale", "to": "one_time_sale", "count": 2}]


def test_removing_the_tag_is_an_exit_not_a_transition():
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0),
                     moves=[("one_time_sale", None, 3)])
    s = _steps(f)
    assert s["one_time_sale"]["net_change"] == -3
    assert s["one_time_sale"]["left"] == 3
    assert f["transitions"] == []


def test_a_legacy_customer_joins_the_funnel_at_the_step_their_order_earns():
    # no sale tag at all, then a first order: an entry straight onto one-time
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0),
                     moves=[(None, "one_time_sale", 4)])
    s = _steps(f)
    assert s["one_time_sale"]["entered"] == 4
    assert s["one_time_sale"]["net_change"] == 4
    assert s["no_sale"]["net_change"] == 0


def test_a_value_that_is_not_a_step_is_neither_counted_nor_a_crash():
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0),
                     moves=[("no_sale", "maybe", 1), ("maybe", "repeated_sale", 1)])
    s = _steps(f)
    assert s["no_sale"]["left"] == 1 and s["no_sale"]["net_change"] == -1
    assert s["repeated_sale"]["entered"] == 1 and s["repeated_sale"]["net_change"] == 1
    assert f["transitions"] == []


def test_no_op_and_zero_rows_change_nothing():
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0),
                     moves=[("no_sale", "no_sale", 9), ("no_sale", "one_time_sale", 0)])
    assert all(s["net_change"] == 0 for s in f["steps"])
    assert f["transitions"] == []


def test_transitions_come_largest_first():
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0), moves=[
        ("no_sale", "one_time_sale", 1),
        ("one_time_sale", "repeated_sale", 9),
    ])
    assert [t["count"] for t in f["transitions"]] == [9, 1]


# --- where customers stand now -----------------------------------------------


def test_current_counts_come_from_the_tags_and_name_the_untagged():
    tags = [
        ["customer_sale:no_sale", "vip"],
        ["customer_sale:one_time_sale"],
        ["customer_sale:one_time_sale", "customer_interest:interested"],
        ["agent:ali"],                      # legacy: no sale tag at all
        [],
        None,                               # a NULL tags column
    ]
    sale = build_funnel(SALE_STEPS, current=current_values(tags, SALE_KEY, len(tags)), moves=[])
    s = _steps(sale)
    assert (s["no_sale"]["current"], s["one_time_sale"]["current"], s["repeated_sale"]["current"]) == (1, 2, 0)
    # the three without a sale tag cannot be placed, and are said so
    assert sale["outside"] == 3

    interest = build_funnel(INTEREST_STEPS, current=current_values(tags, INTEREST_KEY, len(tags)), moves=[])
    i = _steps(interest)
    # here "no tag" is the Unknown step, so nobody is outside
    assert i[None]["current"] == 5 and i["interested"]["current"] == 1
    assert interest["outside"] == 0


def test_the_untagged_are_derived_from_the_total_not_fetched():
    """The route only fetches customers holding a funnel tag; the rest are
    'no tag' by arithmetic. 1,000 live customers, three of them tagged."""
    c = current_values([["customer_sale:no_sale"], ["customer_sale:one_time_sale"], ["vip"]], SALE_KEY, 1000)
    assert c["no_sale"] == 1 and c["one_time_sale"] == 1
    assert c[None] == 998
    # a total that lags the fetch (a customer created in between) never goes negative
    assert current_values([["customer_sale:no_sale"]], SALE_KEY, 0)[None] == 0


def test_key_matching_is_exact_like_the_event_log_and_last_value_wins():
    """record_tag_changes stores the key as typed and the route filters
    events on the exact key, so a strangely-cased manual tag must be invisible
    to the current counts too — or one half of the card would move without
    the other."""
    tags = [["Customer_Sale:no_sale"], ["customer_sale:no_sale", "customer_sale:repeated_sale"]]
    c = current_values(tags, SALE_KEY, len(tags))
    assert c["no_sale"] == 0 and c["repeated_sale"] == 1 and c[None] == 1


def test_an_unrecognised_value_is_outside_the_funnel():
    c = current_values([["customer_interest:maybe"]], INTEREST_KEY, 1)
    assert build_funnel(INTEREST_STEPS, current=c, moves=[])["outside"] == 1


# --- the steps are real catalog tags -----------------------------------------


def test_every_step_is_a_predefined_catalog_tag():
    """The funnel groups on these exact values; a drift from the catalog would
    silently count nothing."""
    catalog = {e["tag"] for e in PREDEFINED_CUSTOMER_TAGS}
    for v in SALE_STEPS:
        assert f"{SALE_KEY}:{v}" in catalog
    for v in INTEREST_STEPS:
        if v is not None:
            assert f"{INTEREST_KEY}:{v}" in catalog
    assert SALE_STEPS == ("no_sale", "one_time_sale", "repeated_sale")
    assert INTEREST_STEPS == (None, "not_interested", "interested")
    # and what the route fetches by is exactly the five placeable tags
    assert set(FUNNEL_TAGS) == {
        f"{SALE_KEY}:{v}" for v in SALE_STEPS
    } | {f"{INTEREST_KEY}:{v}" for v in INTEREST_STEPS if v is not None}
    assert set(FUNNEL_TAGS) <= catalog


# --- a finished period: counts at its END, not today ------------------------


def test_a_finished_period_shows_the_counts_at_its_end_not_todays():
    """September's card, read in October: 18 customers sit on no_sale today,
    but 5 of them only arrived in October and 4 others left it in October —
    at September's close there were 18 - 5 + 4 = 17."""
    tags = [["customer_sale:no_sale"]] * 18 + [["customer_sale:one_time_sale"]] * 8
    f = build_funnel(
        SALE_STEPS, current=current_values(tags, SALE_KEY, len(tags)),
        moves=[("no_sale", "one_time_sale", 3)],                       # September
        moves_after=[(None, "no_sale", 5), ("no_sale", "one_time_sale", 4)],  # October
    )
    s = _steps(f)
    assert s["no_sale"]["current"] == 18
    assert s["no_sale"]["at_period_end"] == 17
    assert s["one_time_sale"]["at_period_end"] == 8 - 4
    # and at September's start: its end minus what September did
    assert s["no_sale"]["at_period_start"] == 17 + 3
    assert s["one_time_sale"]["at_period_start"] == 4 - 3
    # September's own movement is untouched by what came after it
    assert s["no_sale"]["net_change"] == -3
    assert f["transitions"] == [{"from": "no_sale", "to": "one_time_sale", "count": 3}]


def test_the_current_period_ends_now_so_its_counts_are_todays():
    tags = [["customer_sale:no_sale"]] * 3
    f = build_funnel(SALE_STEPS, current=current_values(tags, SALE_KEY, 3), moves=[(None, "no_sale", 3)])
    assert all(s["at_period_end"] == s["current"] for s in f["steps"])


def test_customers_created_after_the_period_did_not_exist_at_its_end():
    """Unknown today includes everyone created since; rewinding to the
    period's end removes them (and returns the two who left Unknown since)."""
    tags = [["customer_interest:interested"]] * 2       # 52 live, 50 unknown today
    f = build_funnel(
        INTEREST_STEPS, current=current_values(tags, INTEREST_KEY, 52), moves=[],
        moves_after=[(None, "interested", 2)], created_after=10,
    )
    s = _steps(f)
    assert s[None]["current"] == 50
    assert s[None]["at_period_end"] == 50 - 10 + 2
    assert s["interested"]["at_period_end"] == 0


def test_a_log_that_contradicts_the_tags_never_shows_a_negative_count():
    f = build_funnel(SALE_STEPS, current=current_values([], SALE_KEY, 0), moves=[],
                     moves_after=[(None, "no_sale", 3)])
    assert _steps(f)["no_sale"]["at_period_end"] == 0


# --- the period parameters and the whole payload -----------------------------


@pytest.mark.parametrize("raw_gran,raw_offset,expected", [
    ("month", "2", ("month", 2)),
    (" QUARTER ", "4", ("quarter", 4)),
    ("week", "0", ("week", 0)),
    (None, None, ("month", 0)),            # defaults: this month
    ("fortnight", "x", ("month", 0)),      # garbage falls back, never 4xx
    ("week", "-3", ("week", 0)),           # the future is not a period
    ("year", "99", ("year", MAX_OFFSET["year"])),
])
def test_resolve_period_params(raw_gran, raw_offset, expected):
    assert resolve_period_params(raw_gran, raw_offset) == expected
    assert set(GRANULARITIES) == {"week", "month", "quarter", "year"} == set(MAX_OFFSET)


def test_payload_routes_each_key_to_its_funnel_and_describes_the_period():
    period = {"granularity": "month", "offset": 1, "label": "2026-09",
              "start": "2026-09-01", "end": "2026-10-01", "is_current": False}
    p = build_payload(
        period=period, history_from=datetime(2026, 8, 15), total=2,
        tag_lists=[["customer_sale:no_sale"], ["customer_interest:interested"]],
        moves=[
            (SALE_KEY, None, "no_sale", 1),
            (INTEREST_KEY, None, "interested", 1),
            ("blacklist", None, "", 5),        # other keys are not this dashboard's business
        ],
        moves_after=[], created=2, created_after=0,
    )
    assert p["period"] == period
    assert p["history_from"] == "2026-08-15T00:00:00"
    assert p["total_customers"] == 2 and p["new_customers"] == 2
    # nothing happened after the period, so its end looks like today
    assert p["total_at_period_end"] == 2
    assert p["funnels"]["sale"]["outside_at_period_end"] == 1      # the interested-only customer
    assert p["funnels"]["interest"]["outside_at_period_end"] == 0
    sale, interest = p["funnels"]["sale"], p["funnels"]["interest"]
    assert sale["key"] == SALE_KEY and interest["key"] == INTEREST_KEY
    assert _steps(sale)["no_sale"]["net_change"] == 1
    # 2 created arrive on Unknown, 1 of them was tagged interested on the spot
    assert _steps(interest)[None]["net_change"] == 1
    assert _steps(interest)["interested"]["net_change"] == 1
    # the sale funnel never sees `created`, the interest funnel does
    assert _steps(sale)["no_sale"]["entered"] == 1
    assert _steps(interest)[None]["entered"] == 2


def test_the_footnote_and_total_rewind_with_the_steps():
    """September read in October: 10 live customers today, 3 of them created
    in October (and tagged no_sale on creation). At September's end there were
    7, all on no_sale — nobody outside."""
    period = {"granularity": "month", "offset": 1, "label": "2026-09",
              "start": "2026-09-01", "end": "2026-10-01", "is_current": False}
    p = build_payload(
        period=period, history_from=datetime(2026, 1, 1), total=10,
        tag_lists=[["customer_sale:no_sale"]] * 10,
        moves=[], moves_after=[(SALE_KEY, None, "no_sale", 3)], created=0, created_after=3,
    )
    sale = p["funnels"]["sale"]
    assert p["total_customers"] == 10 and p["total_at_period_end"] == 7
    assert _steps(sale)["no_sale"]["at_period_end"] == 7
    assert sale["outside"] == 0 and sale["outside_at_period_end"] == 0
    # the interest funnel: 10 unknown today, 7 at September's end
    assert _steps(p["funnels"]["interest"])[None]["at_period_end"] == 7


def test_an_empty_log_reports_no_history_start():
    period = {"granularity": "week", "offset": 0, "label": "2026-W41",
              "start": "2026-10-05", "end": "2026-10-12", "is_current": True}
    p = build_payload(period=period, history_from=None, total=0, tag_lists=[],
                      moves=[], moves_after=[], created=0, created_after=0)
    assert p["history_from"] is None
    assert p["total_customers"] == 0
