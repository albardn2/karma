"""When a subscription gets charged, for what window, and for how much.

A daily job bills every verified account for every monthly period that has begun
and has not been charged. Periods are anchored on the account's CREATION DATE — an
account created on the 18th is billed 18th-to-18th forever, and its first period is
the one that began the day it was created.

That anchor is the point. Keyed off "today" instead, an account created six months
before the billing job first ran would be billed from that day forward and the six
months in between would vanish: no error, no warning, just absent revenue. The
first test below is that scenario.

Two further properties both matter enough to pin:

  * NO DRIFT. Every boundary is computed from the original anchor with an absolute
    month offset, never chained off the previous boundary. A subscription started on
    the 31st goes Jan 31 -> Feb 28 -> Mar 31, not collapsing to the 28th of every
    month once one February has clamped it.
  * BACKFILL, NOT TRICKLE. A run raises every missing period at once, so a job that
    was down for three months catches up on its next run instead of billing one
    period a day for three days.
"""
from datetime import date, datetime, timedelta

import pytest

from app.domains.billing import domain as billing


# --- month arithmetic ------------------------------------------------------


def test_a_month_lands_on_the_same_day_of_the_month():
    assert billing.add_months(date(2026, 1, 18), 1) == date(2026, 2, 18)
    assert billing.add_months(date(2026, 1, 18), 6) == date(2026, 7, 18)


def test_a_short_month_clamps_to_its_last_day():
    assert billing.add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert billing.add_months(date(2026, 3, 31), 1) == date(2026, 4, 30)


def test_clamping_does_not_drift_the_anchor():
    """The bug this avoids: chaining off the clamped result would make every
    subsequent period fall on the 28th, permanently, after one February."""
    anchor = date(2026, 1, 31)
    got = [billing.add_months(anchor, n) for n in range(5)]
    assert got == [
        date(2026, 1, 31),
        date(2026, 2, 28),   # clamped
        date(2026, 3, 31),   # and back to the 31st, not the 28th
        date(2026, 4, 30),   # clamped again
        date(2026, 5, 31),
    ]


def test_february_29_in_a_leap_year():
    assert billing.add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)


def test_the_year_rolls_over():
    assert billing.add_months(date(2026, 12, 18), 1) == date(2027, 1, 18)
    assert billing.add_months(date(2026, 3, 18), 12) == date(2027, 3, 18)
    assert billing.add_months(date(2026, 3, 18), 25) == date(2028, 4, 18)


# --- which periods are missing --------------------------------------------


class _Session:
    """Returns a fixed set of already-charged windows."""

    def __init__(self, windows):
        self._windows = [(s, e) for s, e in windows]

    def query(self, *_a):
        return self

    def filter(self, *_a):
        return self

    def all(self):
        return self._windows


class _Uow:
    def __init__(self, windows=()):
        self.session = _Session(windows)


def missing(anchor, today, charged=()):
    return billing.missing_periods(_Uow(charged), "acct-1", anchor, today)


def test_an_account_with_no_bills_is_billed_from_its_creation_date():
    """THE case this whole scheme exists for.

    Created 2026-01-18, billing first runs 2026-07-31: seven periods have begun
    (Jan through July), and all seven are raised. Under a rule anchored on "today"
    the six months before the job's first run would never have been billed at all.
    """
    got = missing(date(2026, 1, 18), date(2026, 7, 31))
    assert len(got) == 7
    assert got[0] == (date(2026, 1, 18), date(2026, 2, 18)), "must start at creation"
    assert got[-1] == (date(2026, 7, 18), date(2026, 8, 18))


def test_the_backfilled_periods_are_exactly_contiguous():
    got = missing(date(2026, 1, 31), date(2026, 7, 31))
    for (a_start, a_end), (b_start, _) in zip(got, got[1:]):
        assert a_end == b_start, "a gap or overlap opened between periods"


def test_the_grid_itself_does_not_drift_after_a_clamp():
    """Contiguity is not enough to catch drift, which is why this exists.

    Chaining each boundary off the previous one — Jan 31 -> Feb 28 -> Mar 28 ->
    Apr 28 — produces windows that are perfectly contiguous and still wrong: the
    account silently moves to being billed on the 28th forever. Only asserting the
    actual dates catches it, so this pins the whole grid rather than the gaps
    between its members.
    """
    got = missing(date(2026, 1, 31), date(2026, 6, 30))
    assert [start for start, _ in got] == [
        date(2026, 1, 31),
        date(2026, 2, 28),   # clamped by February
        date(2026, 3, 31),   # must return to the 31st, NOT stay on the 28th
        date(2026, 4, 30),
        date(2026, 5, 31),
        date(2026, 6, 30),
    ]


def test_a_period_that_has_not_begun_is_not_billed():
    """Billed in arrears of the period opening, never before it."""
    anchor = date(2026, 7, 18)
    # the day before the second period opens
    assert missing(anchor, date(2026, 8, 17)) == [(date(2026, 7, 18), date(2026, 8, 18))]
    # the day it opens, it is billed
    assert len(missing(anchor, date(2026, 8, 18))) == 2


def test_the_period_is_billed_on_the_day_it_opens():
    anchor = date(2026, 7, 18)
    assert missing(anchor, date(2026, 7, 18)) == [(date(2026, 7, 18), date(2026, 8, 18))]


def test_an_account_created_today_gets_exactly_one_period():
    today = date(2026, 7, 31)
    assert missing(today, today) == [(today, billing.add_months(today, 1))]


def test_nothing_is_billed_before_the_account_exists():
    """A created_at in the future — clock skew, or a bad import — must not produce
    a negative-length backfill or a charge for a period that has not started."""
    assert missing(date(2026, 9, 1), date(2026, 7, 31)) == []


def test_already_charged_periods_are_not_billed_again():
    """Idempotency: feed back exactly what a run would have written."""
    anchor = date(2026, 1, 18)
    first = missing(anchor, date(2026, 7, 31))
    assert first, "premise"
    assert missing(anchor, date(2026, 7, 31), charged=first) == []


def test_only_the_gap_is_filled_when_some_periods_exist():
    """A job down for two months, with the earlier periods already billed."""
    anchor = date(2026, 1, 18)
    already = [
        (date(2026, 1, 18), date(2026, 2, 18)),
        (date(2026, 2, 18), date(2026, 3, 18)),
    ]
    got = missing(anchor, date(2026, 5, 31), charged=already)
    # three, not two: by 31 May the period opening on 18 May has also begun
    assert got == [
        (date(2026, 3, 18), date(2026, 4, 18)),
        (date(2026, 4, 18), date(2026, 5, 18)),
        (date(2026, 5, 18), date(2026, 6, 18)),
    ]


def test_a_hole_in_the_middle_is_filled():
    """Backfill means backfill: an earlier missing period is raised even when a
    later one has already been charged."""
    anchor = date(2026, 1, 18)
    already = [(date(2026, 3, 18), date(2026, 4, 18))]
    got = missing(anchor, date(2026, 4, 30), charged=already)
    assert (date(2026, 1, 18), date(2026, 2, 18)) in got
    assert (date(2026, 2, 18), date(2026, 3, 18)) in got
    assert (date(2026, 3, 18), date(2026, 4, 18)) not in got


def test_a_legacy_calendar_month_charge_covers_the_period_it_overlaps():
    """Charges raised by hand before this scheme sit on calendar months (the 1st),
    not on the account's anniversary. A period counts as covered when an existing
    charge OVERLAPS it — keying on an exact start match would treat those as
    uncovered and bill those months a second time.
    """
    anchor = date(2026, 7, 18)
    legacy = [
        (date(2026, 7, 1), date(2026, 8, 1)),
        (date(2026, 8, 1), date(2026, 9, 1)),
    ]
    assert missing(anchor, date(2026, 7, 31), charged=legacy) == []


def test_the_runaway_guard_bounds_one_run():
    """An implausible created_at (bad import, clock problem) must not try to raise
    thousands of charges in a single transaction."""
    got = missing(date(1990, 1, 1), date(2026, 7, 31))
    assert len(got) == billing.MAX_PERIODS_PER_RUN


# --- how much ------------------------------------------------------------


class _Account:
    uuid = "acct-1"
    company_name = "Test Co"
    subscription_rate = 25.0
    subscription_currency = "USD"
    subscription_type = "flat"
    created_at = datetime(2026, 1, 18, 9, 0, 0)
    verified_at = datetime(2026, 3, 5, 14, 0, 0)


class _CountingSession:
    def __init__(self, user_count):
        self._n = user_count

    def query(self, *_a):
        return self

    def filter(self, *_a):
        return self

    def scalar(self):
        return self._n


class _CountingUow:
    def __init__(self, user_count):
        self.session = _CountingSession(user_count)


def test_the_anchor_is_the_day_the_account_was_verified():
    """Not the day it was created. A company waiting for approval is refused every
    endpoint, so billing it from creation charges it for months it was denied the
    product."""
    assert billing.billing_anchor(_Account()) == date(2026, 3, 5)


def test_the_anchor_falls_back_to_creation_when_never_stamped():
    """Everything predating the verification feature: grandfathered to verified
    precisely because it was never gated, so its admission date IS its creation.
    The fallback also keeps an account billable if the column is somehow null,
    rather than silently exempting it from billing forever."""
    account = _Account()
    account.verified_at = None
    assert billing.billing_anchor(account) == date(2026, 1, 18)


def test_a_company_is_not_billed_for_the_months_it_waited_for_approval():
    """The whole reason the anchor moved. Signed up in January, approved in June:
    it owes from June, not from January."""
    account = _Account()
    account.created_at = datetime(2026, 1, 10, 9, 0)
    account.verified_at = datetime(2026, 6, 20, 14, 0)
    anchor = billing.billing_anchor(account)

    billed = missing(anchor, date(2026, 7, 31))
    assert billed[0][0] == date(2026, 6, 20), "must start at verification"
    assert len(billed) == 2

    from_creation = missing(account.created_at.date(), date(2026, 7, 31))
    assert len(from_creation) == 7, (
        "the premise: anchoring on creation would have billed five extra months"
    )


def test_a_flat_charge_is_the_rate_negated():
    """Charges are stored NEGATIVE — the ledger balance is a plain SUM over signed
    amounts, so the sign is fixed here rather than at each call site."""
    amount, note = billing.charge_amount(_CountingUow(0), _Account())
    assert amount == -25.0
    assert note is None


def test_a_per_user_charge_multiplies_by_the_live_user_count():
    account = _Account()
    account.subscription_type = "per_user"
    amount, note = billing.charge_amount(_CountingUow(4), account)
    assert amount == -100.0
    assert note == "4 users x 25.0"


def test_a_per_user_account_with_no_users_is_charged_nothing():
    """Not an error: an account mid-offboarding legitimately has zero users, and a
    zero charge is the honest answer. It still writes a row, so the period reads as
    covered and the job does not retry it every day."""
    account = _Account()
    account.subscription_type = "per_user"
    amount, note = billing.charge_amount(_CountingUow(0), account)
    assert amount == 0
    assert note == "0 users x 25.0"


def test_an_explicit_base_overrides_the_rate():
    amount, note = billing.charge_amount(_CountingUow(0), _Account(), base=7.5)
    assert amount == -7.5
    assert note is None


def test_an_explicit_base_is_still_forced_negative():
    """A positive number typed into a charge must not become a credit."""
    assert billing.charge_amount(_CountingUow(0), _Account(), base=40).amount == -40


def test_an_account_with_no_rate_cannot_be_charged():
    account = _Account()
    account.subscription_rate = None
    with pytest.raises(ValueError):
        billing.charge_amount(_CountingUow(1), account)


# --- the business day ----------------------------------------------------


def test_today_is_the_damascus_day_not_the_server_day():
    """Servers run UTC and the business does not. A job firing at 23:30 UTC is
    already tomorrow in Damascus; billing it as today would open a period on the
    wrong date. Same +3 the trip-name default uses."""
    from datetime import timezone

    assert billing.DAMASCUS_OFFSET_HOURS == 3
    expected = (datetime.now(timezone.utc) + timedelta(hours=3)).date()
    assert billing.damascus_today() == expected
