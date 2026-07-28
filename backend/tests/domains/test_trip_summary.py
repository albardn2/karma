"""Rolling several trips up into one cash-and-stock summary.

The summary exists to be reconciled against, so the ways it could quietly lie
are what these tests pin:
  - money from different currencies must never land in one total;
  - a cost booked to a trip but never paid must not be deducted from what the
    driver owes back — that would credit them for cash still in their hands;
  - a trip selected twice must not be counted twice;
  - a uuid that resolves to nothing (deleted, or another tenant's) must be
    reported, not treated as a zero-value trip that happens to add nothing;
  - a trip still in progress has no end snapshot, so its stock has not been
    counted back in — it may contribute to `sold` but must not silently drag
    `net_change` down as if everything on board had been sold.
"""
import pytest

from app.domains.trip.domain import TripDomain
from app.dto.trip import TripSummaryParams


SUGAR = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
NUTS = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
GHOST = "cccccccc-3333-4333-8333-cccccccccccc"


class _Trip:
    def __init__(self, uuid, expected_cash=None, trip_expenses=None,
                 trip_expenses_paid=None, start=None, end=None, sold=None):
        self.uuid = uuid
        self.expected_cash = expected_cash or {}
        self.trip_expenses = trip_expenses or {}
        # the ordinary case is a cost paid the moment it is booked, so paid
        # defaults to the whole of it; tests that care pass their own split
        self.trip_expenses_paid = (
            dict(self.trip_expenses) if trip_expenses_paid is None else trip_expenses_paid
        )
        self.trip_expenses_unpaid = {
            currency: round(amount - self.trip_expenses_paid.get(currency, 0), 2)
            for currency, amount in self.trip_expenses.items()
        }
        self.start_inventory = start or {}
        self.end_inventory = end
        self._sold = sold or {}

    @property
    def inventory_reconciliation(self):
        """Mirrors the model property: an end snapshot the trip never took
        leaves actual_end (and so the variance) unknowable."""
        start, end = self.start_inventory or {}, self.end_inventory or {}
        result = {}
        for m in set(start) | set(end) | set(self._sold):
            s = start.get(m, 0) or 0
            sld = self._sold.get(m, 0) or 0
            actual_end = end.get(m)
            result[m] = {
                "start": s,
                "sold": sld,
                "expected_end": s - sld,
                "actual_end": actual_end,
                "variance": (actual_end - (s - sld)) if actual_end is not None else None,
            }
        return result


class _Page:
    def __init__(self, items):
        self.items = items


class _Repo:
    def __init__(self, trips):
        self._trips = trips
        self.calls = []

    def find_all_by_filters_paginated(self, filters, page, per_page):
        self.calls.append({"filters": filters, "page": page, "per_page": per_page})
        return _Page(list(self._trips))


class _MaterialQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args):
        return self

    def __iter__(self):
        return iter(self._rows)


class _Session:
    def __init__(self, rows):
        self._rows = rows

    def query(self, *_cols):
        return _MaterialQuery(self._rows)


class _Uow:
    account_uuid = "acct-1"

    def __init__(self, trips, material_rows=()):
        self.trip_repository = _Repo(trips)
        self.session = _Session(list(material_rows))


MATERIALS = [
    (SUGAR, "Sugar", "kg"),
    (NUTS, "Mixed nuts", "kg"),
]


def _summary(trips, requested=None, material_rows=MATERIALS):
    uow = _Uow(trips, material_rows)
    return TripDomain.summarize(
        uow=uow, trip_uuids=requested or [t.uuid for t in trips]
    )


# --- cash ------------------------------------------------------------------

def test_cash_is_summed_per_currency_never_across():
    trips = [
        _Trip("t1", expected_cash={"SYP": 1000.0, "USD": 40.0}, trip_expenses={"SYP": 250.0}),
        _Trip("t2", expected_cash={"SYP": 500.5}, trip_expenses={"USD": 5.0}),
    ]
    by_currency = {row.currency: row for row in _summary(trips).cash}
    assert by_currency["SYP"].collected == 1500.5
    assert by_currency["SYP"].expenses == 250.0
    assert by_currency["SYP"].net == 1250.5
    assert by_currency["USD"].collected == 40.0
    assert by_currency["USD"].expenses == 5.0
    assert by_currency["USD"].net == 35.0


def test_only_what_was_paid_comes_off_the_net():
    """A cost booked to the trip but never paid is still sitting in the driver's
    cash, so it must be reported and left out of the net, not deducted."""
    trips = [
        _Trip("t1", expected_cash={"SYP": 1000.0},
              trip_expenses={"SYP": 300.0}, trip_expenses_paid={"SYP": 100.0}),
    ]
    row = _summary(trips).cash[0]
    assert row.expenses == 300.0        # booked
    assert row.expenses_paid == 100.0   # actually out of pocket
    assert row.expenses_unpaid == 200.0
    assert row.net == 900.0             # 1000 - 100, NOT 1000 - 300


def test_an_entirely_unpaid_expense_leaves_the_net_alone():
    """The whole of PR #62's hole: an expense with no live payout must not
    credit the driver for money that never left."""
    trips = [
        _Trip("t1", expected_cash={"SYP": 500.0},
              trip_expenses={"SYP": 80.0}, trip_expenses_paid={}),
    ]
    row = _summary(trips).cash[0]
    assert row.expenses_paid == 0
    assert row.expenses_unpaid == 80.0
    assert row.net == 500.0


def test_paid_and_unpaid_are_summed_per_currency_across_trips():
    trips = [
        _Trip("t1", expected_cash={"SYP": 600.0},
              trip_expenses={"SYP": 100.0}, trip_expenses_paid={"SYP": 100.0}),
        _Trip("t2", expected_cash={"SYP": 400.0},
              trip_expenses={"SYP": 50.0}, trip_expenses_paid={"SYP": 20.0}),
    ]
    row = _summary(trips).cash[0]
    assert row.expenses == 150.0
    assert row.expenses_paid == 120.0
    assert row.expenses_unpaid == 30.0
    assert row.net == 880.0


def test_a_currency_only_spent_in_still_gets_a_row():
    """Spending SYP on a USD-collecting trip is exactly the case an audit is
    looking for; dropping the row would hide the money."""
    trips = [_Trip("t1", expected_cash={"USD": 20.0}, trip_expenses={"SYP": 300.0})]
    by_currency = {row.currency: row for row in _summary(trips).cash}
    assert by_currency["SYP"].collected == 0
    assert by_currency["SYP"].net == -300.0


def test_net_comes_from_the_unrounded_pair_so_the_column_adds_up():
    trips = [
        _Trip("t1", expected_cash={"SYP": 0.005}, trip_expenses={"SYP": 0.004}),
        _Trip("t2", expected_cash={"SYP": 0.005}, trip_expenses={"SYP": 0.004}),
    ]
    row = _summary(trips).cash[0]
    assert row.net == round(0.01 - 0.008, 2)


def test_no_cash_means_no_cash_rows():
    assert _summary([_Trip("t1")]).cash == []


# --- stock -----------------------------------------------------------------

def test_material_movement_is_summed_across_trips():
    trips = [
        _Trip("t1", start={SUGAR: 100}, end={SUGAR: 30}, sold={SUGAR: 70}),
        _Trip("t2", start={SUGAR: 50}, end={SUGAR: 20}, sold={SUGAR: 30}),
    ]
    row = _summary(trips).materials[0]
    assert row.material_name == "Sugar"
    assert row.measure_unit == "kg"
    assert row.loaded == 150
    assert row.sold == 100
    assert row.returned == 50
    assert row.net_change == -100          # 50 back out of 150 loaded
    assert row.variance == 0
    assert row.net_change_partial is False


def test_shrinkage_shows_up_as_variance_not_as_sales():
    """10 kg went missing: sold says 70, the vans are 80 lighter."""
    trips = [_Trip("t1", start={SUGAR: 100}, end={SUGAR: 20}, sold={SUGAR: 70})]
    row = _summary(trips).materials[0]
    assert row.sold == 70
    assert row.net_change == -80
    assert row.variance == -10


def test_a_trip_with_no_end_snapshot_does_not_fake_an_outflow():
    """The in-progress trip loaded 60 and has sold 10 so far. Its stock has not
    been counted back in, so net_change must cover only the finished trip."""
    trips = [
        _Trip("done", start={SUGAR: 100}, end={SUGAR: 40}, sold={SUGAR: 60}),
        _Trip("live", start={SUGAR: 60}, end=None, sold={SUGAR: 10}),
    ]
    summary = _summary(trips)
    row = summary.materials[0]
    assert row.sold == 70                  # both trips
    assert row.loaded == 160               # both trips
    assert row.net_change == -60           # only the finished one
    assert row.returned == 40
    assert row.net_change_partial is True
    assert summary.trips_without_end_inventory == ["live"]


def test_an_empty_end_snapshot_is_reported_as_missing():
    """`{}` is what a trip that never finished carries, not a van that came
    back empty — a counted-empty van has explicit zeros."""
    summary = _summary([_Trip("t1", start={SUGAR: 10}, end={}, sold={})])
    assert summary.trips_without_end_inventory == ["t1"]
    assert summary.materials[0].net_change_partial is True


def test_a_van_counted_back_empty_is_a_real_zero():
    trips = [_Trip("t1", start={SUGAR: 10}, end={SUGAR: 0}, sold={SUGAR: 10})]
    summary = _summary(trips)
    assert summary.trips_without_end_inventory == []
    row = summary.materials[0]
    assert row.net_change == -10
    assert row.net_change_partial is False


def test_materials_are_named_and_sorted_unknown_last():
    trips = [_Trip("t1", start={NUTS: 5, SUGAR: 5, GHOST: 5},
                   end={NUTS: 5, SUGAR: 5, GHOST: 5})]
    rows = _summary(trips).materials
    assert [r.material_name for r in rows] == ["Mixed nuts", "Sugar", None]


def test_a_foreign_materials_name_is_not_leaked():
    """GHOST is not in this account's material rows, so it has no name."""
    rows = _summary([_Trip("t1", start={GHOST: 5}, end={GHOST: 5})]).materials
    assert rows[0].material_uuid == GHOST
    assert rows[0].material_name is None


def test_fractional_quantities_survive():
    trips = [_Trip("t1", start={SUGAR: 12.5}, end={SUGAR: 0.25}, sold={SUGAR: 12.25})]
    row = _summary(trips).materials[0]
    assert row.net_change == -12.25


# --- what the summary does not cover ---------------------------------------

def test_uuids_that_resolve_to_nothing_are_reported():
    """A trip from another tenant, or a deleted one, must not pass as a trip
    that simply contributed nothing."""
    summary = _summary([_Trip("t1", expected_cash={"SYP": 10.0})],
                       requested=["t1", "foreign", "deleted"])
    assert summary.trip_count == 1
    assert summary.trip_uuids == ["t1"]
    assert summary.missing_uuids == ["foreign", "deleted"]


def test_the_query_is_account_scoped_and_excludes_deleted():
    """The repository appends the account filter; this asserts the domain hands
    it the is_deleted guard and a bounded page rather than relying on defaults."""
    uow = _Uow([_Trip("t1")])
    TripDomain.summarize(uow=uow, trip_uuids=["t1"])
    call = uow.trip_repository.calls[0]
    assert call["page"] == 1 and call["per_page"] == 100
    assert len(call["filters"]) == 2


# --- request parsing -------------------------------------------------------

def test_a_trip_selected_twice_is_counted_once():
    params = TripSummaryParams(trip_uuids="t1,t2,t1")
    assert params.trip_uuids == ["t1", "t2"]


def test_whitespace_and_blanks_are_dropped():
    params = TripSummaryParams(trip_uuids=" t1 , ,t2,")
    assert params.trip_uuids == ["t1", "t2"]


def test_an_empty_selection_is_rejected():
    with pytest.raises(Exception):
        TripSummaryParams(trip_uuids="")


def test_more_than_a_page_of_trips_is_rejected():
    with pytest.raises(Exception):
        TripSummaryParams(trip_uuids=",".join(f"t{i}" for i in range(101)))
