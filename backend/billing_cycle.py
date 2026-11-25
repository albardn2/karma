"""Monthly billing periods, shared by the API's billing and the assistant service.

A company is billed on the same day every month, starting from its billing anchor
(the day it was verified), and the assistant's monthly allowance resets on that
same day so a company's usage lines up with the invoice that pays for it.

Dependency-free on purpose: the assistant service ships without the API's
packages and copies this one file into its image.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Optional

# The business runs in Damascus (UTC+3) and the servers run UTC, so "today" has to
# be pinned to the business day or a job firing in the evening bills for yesterday.
DAMASCUS_OFFSET_HOURS = 3


def damascus_today(now: Optional[datetime] = None) -> date:
    """The business day in Damascus. `now` is an aware datetime (defaults to now)."""
    return ((now or datetime.now(timezone.utc)) + timedelta(hours=DAMASCUS_OFFSET_HOURS)).date()


def add_months(anchor: date, months: int) -> date:
    """`anchor` shifted by `months`, clamped to the end of the target month.

    Always called with the ORIGINAL anchor and an absolute offset, never chained off
    the previous result. That is what stops the drift: an account created on the
    31st gets Jan 31 -> Feb 28 -> Mar 31 -> Apr 30, rather than collapsing to the
    28th of every month once one February has clamped it.
    """
    total = anchor.month - 1 + months
    year = anchor.year + total // 12
    month = total % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def current_period(anchor: date, today: date) -> tuple[date, date]:
    """The half-open monthly period [start, end) on `anchor`'s grid containing `today`.

    A `today` before the anchor gets the first period, which is the one the
    account will be billed for first.
    """
    if today < anchor:
        return anchor, add_months(anchor, 1)
    n = (today.year - anchor.year) * 12 + today.month - anchor.month
    if add_months(anchor, n) > today:
        n -= 1
    return add_months(anchor, n), add_months(anchor, n + 1)


def day_start_utc(day: date) -> datetime:
    """Midnight of a Damascus business day, as the naive UTC datetime the tables store."""
    return datetime(day.year, day.month, day.day) - timedelta(hours=DAMASCUS_OFFSET_HOURS)


def billing_anchor_of(verified_at: Optional[datetime], created_at: datetime) -> date:
    """The day a company's billing grid starts: the day it was verified, or, for an
    account that predates verification, the day it was created."""
    return (verified_at or created_at).date()


def recent_periods(anchor: date, today: date, count: int) -> list[tuple[date, date]]:
    """Up to `count` periods ending with the current one, oldest first, never before the anchor."""
    start, _ = current_period(anchor, today)
    current = (start.year - anchor.year) * 12 + start.month - anchor.month
    first = max(0, current - count + 1)
    return [(add_months(anchor, n), add_months(anchor, n + 1)) for n in range(first, current + 1)]
