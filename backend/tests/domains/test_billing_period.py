"""When a subscription gets charged, and for how much.

A daily job bills every verified account whose cover has run out. The rule it uses
is the whole of its safety, because the job runs on `restart: always` in compose
and can therefore run twice in a day, twice in a minute, or once after a three-day
outage — and it writes money rows.

The rule, stated once:

    charge iff MAX(period_end) over the account's live charges is NULL or <= today,
    and the window written is [start, start + 30) where start is that MAX, or today
    when there is none.

Two properties fall out of it and both are tested below. It is IDEMPOTENT — after a
run, MAX(period_end) is today + 30, which is > today, so the next run skips. And
consecutive periods are exactly CONTIGUOUS — the next window opens on the day the
last one ended, so a missed day leaves no unbilled gap and no double-billed
overlap.

Periods are a rolling 30 days, not calendar months: a company that signs up on the
28th is entitled to thirty days of service like everyone else.
"""
from datetime import date, timedelta

import pytest

from app.domains.billing import domain as billing


class _Session:
    """Returns a fixed MAX(period_end), which is all next_period reads."""

    def __init__(self, covered_until):
        self._value = covered_until

    def query(self, *_a):
        return self

    def filter(self, *_a):
        return self

    def scalar(self):
        return self._value


class _Uow:
    def __init__(self, covered_until=None):
        self.session = _Session(covered_until)


TODAY = date(2026, 7, 31)


def window(covered_until, today=TODAY):
    return billing.next_period(_Uow(covered_until), "acct-1", today)


# --- when to charge -------------------------------------------------------


def test_an_account_never_charged_starts_today():
    assert window(None) == (TODAY, TODAY + timedelta(days=30))


def test_an_account_covered_past_today_is_left_alone():
    """The skip that makes the job safe to run repeatedly."""
    assert window(TODAY + timedelta(days=1)) is None
    assert window(TODAY + timedelta(days=29)) is None


def test_cover_ending_exactly_today_is_charged_from_today():
    """period_end is EXCLUSIVE, so a window ending today does not cover today.

    This is the off-by-one that would either bill a day early every period or
    leave one unbilled day in each — pinned from both sides by this test and the
    one above.
    """
    assert window(TODAY) == (TODAY, TODAY + timedelta(days=30))


def test_lapsed_cover_is_charged_from_where_it_ended_not_from_today():
    """Contiguity: no gap, no overlap, even if the job misses days."""
    lapsed = TODAY - timedelta(days=3)
    assert window(lapsed) == (lapsed, lapsed + timedelta(days=30))


def test_running_again_after_a_charge_skips():
    """The idempotency loop, walked explicitly: charge, then re-read."""
    first = window(None)
    assert first is not None
    _, first_end = first
    assert window(first_end) is None, "a second run in the same day would double-charge"


def test_consecutive_periods_are_exactly_contiguous():
    """Walk a year and assert no day is billed twice or missed."""
    start, end = window(None)
    seen = [(start, end)]
    day = end
    for _ in range(12):
        nxt = window(end, today=day)
        assert nxt is not None, "cover had lapsed; it should have billed"
        start, end = nxt
        assert start == seen[-1][1], "a gap or overlap opened between periods"
        seen.append((start, end))
        day = end
    # every window is 30 days, and they tile the line without a break
    assert all((e - s).days == billing.PERIOD_DAYS for s, e in seen)
    assert seen[-1][1] - seen[0][0] == timedelta(days=30 * len(seen))


def test_a_period_is_thirty_days_not_a_calendar_month():
    """February would be 28, July 31; the point of rolling is that neither is."""
    for first_of_month in (date(2026, 2, 1), date(2026, 7, 1), date(2026, 12, 1)):
        start, end = window(None, today=first_of_month)
        assert (end - start).days == 30


# --- how much ------------------------------------------------------------


class _Account:
    uuid = "acct-1"
    company_name = "Test Co"
    subscription_rate = 25.0
    subscription_currency = "USD"
    subscription_type = "flat"


class _CountingSession:
    """Stands in for the per_user user-count query."""

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
    zero charge is the honest answer. It still writes a row, so the period is
    marked covered and the job does not retry it every day."""
    account = _Account()
    account.subscription_type = "per_user"
    amount, note = billing.charge_amount(_CountingUow(0), account)
    assert amount == 0
    assert note == "0 users x 25.0"


def test_an_explicit_base_overrides_the_rate():
    """What the console's free-text amount does."""
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
    already tomorrow in Damascus, and billing it as today would open the period on
    the wrong date — the same +3 the trip-name default uses."""
    from datetime import datetime, timezone

    assert billing.DAMASCUS_OFFSET_HOURS == 3
    utc_now = datetime.now(timezone.utc)
    expected = (utc_now + timedelta(hours=3)).date()
    assert billing.damascus_today() == expected
