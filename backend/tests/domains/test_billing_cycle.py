"""Which billing period a day falls in, shared by invoicing and the assistant allowance."""
from datetime import date, datetime

import pytest

from billing_cycle import billing_anchor_of, current_period, day_start_utc

ANCHOR = date(2026, 1, 31)


@pytest.mark.parametrize("today, period", [
    (date(2026, 1, 31), (date(2026, 1, 31), date(2026, 2, 28))),
    (date(2026, 2, 27), (date(2026, 1, 31), date(2026, 2, 28))),
    (date(2026, 2, 28), (date(2026, 2, 28), date(2026, 3, 31))),
    (date(2026, 3, 30), (date(2026, 2, 28), date(2026, 3, 31))),
    (date(2027, 1, 31), (date(2027, 1, 31), date(2027, 2, 28))),
])
def test_the_current_period_follows_the_anchor_grid_without_drift(today, period):
    assert current_period(ANCHOR, today) == period


def test_a_day_before_the_anchor_is_in_the_first_period():
    assert current_period(ANCHOR, date(2026, 1, 1)) == (ANCHOR, date(2026, 2, 28))


def test_a_business_day_starts_at_damascus_midnight_in_utc():
    assert day_start_utc(date(2026, 3, 1)) == datetime(2026, 2, 28, 21, 0)


@pytest.mark.parametrize("verified_at, expected", [
    (datetime(2026, 6, 20, 14), date(2026, 6, 20)),
    (None, date(2026, 1, 10)),
])
def test_the_anchor_is_verification_falling_back_to_creation(verified_at, expected):
    assert billing_anchor_of(verified_at, datetime(2026, 1, 10, 9)) == expected
