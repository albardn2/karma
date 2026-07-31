"""Subscription charges against the platform ledger.

Two callers raise charges and they must agree: the super-admin console, where an
owner clicks a button, and the daily job, which bills every account that has
fallen behind. The amount arithmetic lives here rather than in either of them,
because a charge computed two slightly different ways is the kind of bug nobody
notices until a customer disputes an invoice.

PERIODS ARE MONTHLY, ANCHORED ON THE ACCOUNT'S CREATION DATE. An account created on
the 18th is billed 18th-to-18th, forever, and its first period is the one that began
the day it was created — not the day the billing job first happened to run. That
distinction is the whole point: keyed off "now" instead, every month between a
company signing up and the job's first run would go unbilled, silently.

Every period boundary is computed from the ORIGINAL anchor rather than from the
previous boundary, so a subscription started on the 31st does not drift down to the
28th forever after passing through one February.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from typing import NamedTuple, Optional

from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import Account as AccountModel
from models.common import AccountLedgerEntry as LedgerModel
from models.common import User as UserModel

log = logging.getLogger("billing")

# The business runs in Damascus (UTC+3) and the servers run UTC, so "today" has to
# be pinned to the business day or a job firing in the evening bills for yesterday.
# Same offset the trip-name default uses.
DAMASCUS_OFFSET_HOURS = 3

# A runaway guard, not a policy: the number of periods to raise in one sweep for one
# account. Reached only if an account's creation date is implausibly far in the past
# (a bad import, a clock problem), and the job logs loudly rather than silently
# stopping. Ten years of monthly periods.
MAX_PERIODS_PER_RUN = 120


def damascus_today() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=DAMASCUS_OFFSET_HOURS)).date()


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


def billing_anchor(account: AccountModel) -> date:
    """The day of the month this account is billed on: the day it was VERIFIED.

    Not the day it was created. A company that signs up and then waits for approval
    is refused every endpoint in the meantime, so billing it from creation would
    charge it for months it was actively denied the product.

    Falls back to `created_at` for accounts with no `verified_at` — everything that
    predates the verification feature, which was grandfathered to verified precisely
    because it was never gated, and whose honest admission date is its creation.
    The fallback is also what keeps an account billable if the column is ever null
    for a reason nobody anticipated, rather than silently exempting it.
    """
    return (account.verified_at or account.created_at).date()


class ChargeAmount(NamedTuple):
    """A charge's signed amount, plus the note explaining how it was reached."""

    amount: float
    note: Optional[str]


def charge_amount(uow: SqlAlchemyUnitOfWork, account: AccountModel,
                  base: Optional[float] = None) -> ChargeAmount:
    """What to bill this account for one period.

    `base` overrides the subscription rate, which is what lets an owner type a
    one-off amount in the console. Everything else derives from the account.

    The sign is fixed here: charges are stored NEGATIVE, because the ledger's
    balance is a plain SUM over signed amounts (payments positive, charges
    negative). Returning an unsigned number and leaving the caller to negate it is
    exactly how the two call sites would drift.
    """
    note = None
    if base is None:
        if account.subscription_rate is None:
            raise ValueError("account has no subscription rate")
        base = account.subscription_rate
        if (account.subscription_type or "flat") == "per_user":
            user_count = (
                uow.session.query(func.count(UserModel.uuid))
                .filter(
                    UserModel.account_uuid == account.uuid,
                    UserModel.is_deleted.is_(False),
                )
                .scalar()
            ) or 0
            base = account.subscription_rate * user_count
            note = f"{user_count} users x {account.subscription_rate}"
    return ChargeAmount(amount=-abs(base), note=note)


def existing_charge_windows(uow: SqlAlchemyUnitOfWork,
                            account_uuid: str) -> list[tuple[date, date]]:
    """Every window this account's live charges already cover."""
    return [
        (row[0], row[1])
        for row in uow.session.query(LedgerModel.period_start, LedgerModel.period_end)
        .filter(
            LedgerModel.account_uuid == account_uuid,
            LedgerModel.entry_type == "charge",
            LedgerModel.is_deleted.is_(False),
            LedgerModel.period_start.isnot(None),
        )
        .all()
    ]


def missing_periods(uow: SqlAlchemyUnitOfWork, account_uuid: str,
                    anchor: date, today: date) -> list[tuple[date, date]]:
    """Every monthly period that has begun and is not already charged.

    Walks the account's own monthly grid from the day it was created up to today,
    and returns the windows nothing covers. A period counts as covered when an
    existing charge OVERLAPS it, not merely when one starts on the same day — that
    is deliberate, because charges raised by hand before this scheme existed sit on
    calendar months (the 1st) rather than on the account's anniversary, and treating
    those as uncovered would bill those months a second time.

    Returning a list rather than a single window is what makes a gap self-heal: a
    job that was down for three months raises all three periods on its next run,
    instead of trickling one per day and leaving the account behind.
    """
    covered = existing_charge_windows(uow, account_uuid)
    out: list[tuple[date, date]] = []
    n = 0
    while n < MAX_PERIODS_PER_RUN:
        period_start = add_months(anchor, n)
        if period_start > today:
            break                      # not begun yet — nothing to bill
        period_end = add_months(anchor, n + 1)
        if not any(s < period_end and e > period_start for s, e in covered):
            out.append((period_start, period_end))
        n += 1
    else:
        log.warning(
            "billing: account %s hit the %d-period cap in one run — check its "
            "created_at (%s); the remainder will be raised on the next run",
            account_uuid, MAX_PERIODS_PER_RUN, anchor,
        )
    return out


def create_charge(uow: SqlAlchemyUnitOfWork, account: AccountModel,
                  period_start: date, period_end: date,
                  base: Optional[float] = None,
                  created_by_uuid: Optional[str] = None,
                  notes: Optional[str] = None) -> LedgerModel:
    """Write one charge. Caller commits.

    `created_by_uuid` is None when the daily job raises it — the column is
    nullable exactly so an automated charge does not have to impersonate a person.
    """
    if not account.subscription_currency:
        raise ValueError("account has no subscription currency")

    amount, auto_note = charge_amount(uow, account, base=base)
    entry = LedgerModel(
        account_uuid=account.uuid,
        entry_type="charge",
        amount=amount,
        currency=account.subscription_currency,
        # kept for the console, which displays it: the month the period opens in
        period=period_start.strftime("%Y-%m"),
        period_start=period_start,
        period_end=period_end,
        notes=notes or auto_note,
        created_by_uuid=created_by_uuid,
    )
    uow.account_ledger_repository.save(model=entry, commit=False)
    return entry


def billable_accounts(uow: SqlAlchemyUnitOfWork) -> list[AccountModel]:
    """Accounts the daily job may charge.

    Unverified accounts are excluded: they cannot use the product at all, so
    letting them accrue a balance would bill a company for a service it is being
    denied. Blocked accounts ARE included — blocking is generally a response to
    non-payment, and a debt that stops growing the moment you stop paying is not a
    debt.

    An account with no rate or no currency is not skipped here but by the caller,
    which logs it: silence would hide a misconfigured account forever.
    """
    return (
        uow.session.query(AccountModel)
        .filter(
            AccountModel.is_deleted.is_(False),
            AccountModel.is_verified.is_(True),
        )
        .order_by(AccountModel.created_at.asc())
        .all()
    )
