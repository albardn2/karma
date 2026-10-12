"""The sales and interest funnels for one trip.

The arithmetic is the company dashboard's (test_tag_funnels.py pins it); what
is new here is WHO counts and WHICH stretch of time is the trip's — and those
are exactly the parts that go quietly wrong: a trip with no start_time, a trip
still running, a trip cancelled before it set off.
"""
from datetime import datetime

from app.domains.customer.auto_tags import INTEREST_KEY, SALE_KEY
from app.domains.trip.tag_funnels import (
    ACTIVITY_GRACE,
    COUNTED_STOP_STATUSES,
    build_trip_payload,
    trip_window,
)
from app.dto.trip_stop import TripStopStatus

CANCELLED = "cancelled"
COMPLETED = "completed"

NOW = datetime(2026, 10, 12, 15, 0)
PLANNED = datetime(2026, 10, 1, 8, 0)
STARTED = datetime(2026, 10, 3, 7, 0)
ENDED = datetime(2026, 10, 3, 16, 0)


def _steps(funnel):
    return {s["value"]: s for s in funnel["steps"]}


# --- who counts --------------------------------------------------------------


def test_only_stops_the_rep_reached_count():
    """Completed and skipped stops were reached; a cancelled one never was,
    and a planned or in-progress one has not been yet."""
    assert set(COUNTED_STOP_STATUSES) == {TripStopStatus.COMPLETED.value, TripStopStatus.SKIPPED.value}


# --- which window ------------------------------------------------------------


def test_a_finished_trip_is_its_start_to_its_end():
    assert trip_window(start_time=STARTED, end_time=ENDED, created_at=PLANNED, now=NOW) == (STARTED, ENDED, False, False)


def test_a_running_trip_is_measured_up_to_now():
    assert trip_window(start_time=STARTED, end_time=None, created_at=PLANNED, now=NOW) == (STARTED, NOW, True, False)


def test_a_trip_with_no_start_time_falls_back_to_when_it_was_created():
    """Web-created trips, and trips planned before departure stamped
    start_time, carry none — the stock chart on the same page uses
    created_at for them too. The window is then a guess, and says so."""
    assert trip_window(start_time=None, end_time=ENDED, created_at=PLANNED, now=NOW) == (PLANNED, ENDED, False, True)


def test_an_end_before_the_start_collapses_instead_of_inverting():
    start, end, _, _ = trip_window(start_time=ENDED, end_time=STARTED, created_at=PLANNED, now=NOW)
    assert start == end == ENDED


def test_a_cancelled_trip_ends_at_its_last_stop_not_when_it_was_closed():
    """The abandoned-trips migration closed old trips with the day IT ran —
    months after their last stop. Measuring to that would credit the trip
    with everything its customers did in between."""
    closed = datetime(2026, 10, 10, 16, 31)
    last_stop = datetime(2026, 10, 3, 12, 0)
    start, end, is_open, estimated = trip_window(
        start_time=STARTED, end_time=closed, created_at=PLANNED, now=NOW,
        status=CANCELLED, last_activity_at=last_stop,
    )
    assert (start, end, is_open, estimated) == (STARTED, last_stop + ACTIVITY_GRACE, False, False)


def test_the_last_stops_own_tag_change_falls_inside_the_window():
    """A stop completion stamps its end_time and THEN writes the outcome's
    tag event a few milliseconds later; the window must still contain it."""
    last_stop = datetime(2026, 10, 3, 12, 0, 0)
    its_tag_event = datetime(2026, 10, 3, 12, 0, 0, 40_000)
    _, end, _, _ = trip_window(
        start_time=STARTED, end_time=datetime(2026, 10, 10), created_at=PLANNED, now=NOW,
        status=CANCELLED, last_activity_at=last_stop,
    )
    assert its_tag_event < end


def test_a_cancelled_trip_with_no_recorded_activity_is_taken_as_its_first_day():
    closed = datetime(2026, 10, 10, 16, 31)
    start, end, is_open, estimated = trip_window(
        start_time=STARTED, end_time=closed, created_at=PLANNED, now=NOW, status=CANCELLED,
    )
    assert end == datetime(2026, 10, 4, 7, 0) and estimated and not is_open


def test_a_cancelled_trip_never_ends_after_its_own_end_time():
    """Cancelled an hour in, with an order typed in later the same week: the
    trip still stopped when it was cancelled."""
    cancelled_at = datetime(2026, 10, 3, 8, 0)
    _, end, _, _ = trip_window(
        start_time=STARTED, end_time=cancelled_at, created_at=PLANNED, now=NOW,
        status=CANCELLED, last_activity_at=datetime(2026, 10, 6),
    )
    assert end == cancelled_at


def test_a_cancelled_trip_is_never_open_even_without_an_end_time():
    _, end, is_open, _ = trip_window(
        start_time=STARTED, end_time=None, created_at=PLANNED, now=NOW,
        status=CANCELLED, last_activity_at=datetime(2026, 10, 3, 12, 0),
    )
    assert not is_open and end == datetime(2026, 10, 3, 12, 0) + ACTIVITY_GRACE


def test_a_completed_trip_without_an_end_time_is_closed_not_running():
    """The web's new-trip dialog can save status Completed with no end time;
    measured to now it would claim every later change for itself."""
    last_stop = datetime(2026, 10, 3, 12, 0)
    _, end, is_open, _ = trip_window(
        start_time=STARTED, end_time=None, created_at=PLANNED, now=NOW,
        status=COMPLETED, last_activity_at=last_stop,
    )
    assert not is_open and end == last_stop + ACTIVITY_GRACE


def test_a_completed_trip_with_an_end_time_keeps_it():
    _, end, _, _ = trip_window(
        start_time=STARTED, end_time=ENDED, created_at=PLANNED, now=NOW,
        status=COMPLETED, last_activity_at=datetime(2026, 10, 3, 9, 0),
    )
    assert end == ENDED


# --- the payload -------------------------------------------------------------


def _payload(**overrides):
    args = dict(
        trip_uuid="trip-1", start=STARTED, end=ENDED, is_open=False,
        history_from=datetime(2025, 12, 25), stops=0, total=0, tag_lists=[],
        moves=[], moves_after=[], created=0, created_after=0,
    )
    args.update(overrides)
    return build_trip_payload(**args)


def test_a_trip_that_sold_shows_before_after_and_the_move():
    """Five customers stopped at: three had never bought, two bought on the
    trip. One of them was added at a stop during the trip (no_sale on
    creation, then the order). Today, after the trip, nothing else happened."""
    tags = [["customer_sale:no_sale"]] * 3 + [["customer_sale:one_time_sale", "customer_interest:interested"]] * 2
    p = _payload(
        stops=6, total=5, tag_lists=tags, created=1,
        moves=[
            (SALE_KEY, None, "no_sale", 1),               # the customer added at a stop
            (SALE_KEY, "no_sale", "one_time_sale", 2),    # the two orders
            (INTEREST_KEY, None, "interested", 2),
        ],
    )
    sale = _steps(p["funnels"]["sale"])
    # before the trip: the four customers who already existed were all on
    # no_sale (two of them then bought; the fifth did not exist yet)
    assert sale["no_sale"]["at_period_start"] == 4 and sale["no_sale"]["at_period_end"] == 3
    assert sale["one_time_sale"]["at_period_start"] == 0 and sale["one_time_sale"]["at_period_end"] == 2
    assert sale["no_sale"]["net_change"] == -1 and sale["one_time_sale"]["net_change"] == 2
    assert p["funnels"]["sale"]["transitions"] == [{"from": "no_sale", "to": "one_time_sale", "count": 2}]

    interest = _steps(p["funnels"]["interest"])
    # Unknown: 4 before (the new one did not exist), 3 after (+1 created, -2 interested)
    assert interest[None]["at_period_start"] == 4 and interest[None]["at_period_end"] == 3
    assert interest["interested"]["at_period_start"] == 0 and interest["interested"]["at_period_end"] == 2

    assert (p["trip_uuid"], p["stops"], p["total_at_period_end"], p["new_customers"]) == ("trip-1", 6, 5, 1)


def test_a_finished_trip_rewinds_what_happened_to_its_customers_since():
    """Two customers bought on the trip; one of them bought again a week
    later. The trip's card must show one-time 2 at its end, not today's
    split."""
    tags = [["customer_sale:one_time_sale"], ["customer_sale:repeated_sale"]]
    p = _payload(
        total=2, tag_lists=tags,
        moves=[(SALE_KEY, "no_sale", "one_time_sale", 2)],
        moves_after=[(SALE_KEY, "one_time_sale", "repeated_sale", 1)],
    )
    sale = _steps(p["funnels"]["sale"])
    assert sale["one_time_sale"]["current"] == 1 and sale["one_time_sale"]["at_period_end"] == 2
    assert sale["repeated_sale"]["at_period_end"] == 0
    assert sale["no_sale"]["at_period_start"] == 2


def test_the_window_is_reported_and_a_running_trip_is_marked():
    p = _payload(start=STARTED, end=NOW, is_open=True)
    assert p["period"] == {"start": STARTED.isoformat(), "end": NOW.isoformat(),
                           "is_current": True, "estimated": False}
    assert _payload(estimated=True)["period"]["estimated"] is True
    assert p["history_from"] == "2025-12-25T00:00:00"


def test_a_trip_with_nothing_worked_is_an_empty_payload_not_an_error():
    p = _payload()
    assert p["total_customers"] == 0 and p["stops"] == 0
    assert all(s["at_period_end"] == 0 for s in p["funnels"]["sale"]["steps"])
