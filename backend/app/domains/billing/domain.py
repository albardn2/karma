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

import logging
from datetime import date
from typing import NamedTuple, Optional

from sqlalchemy import func

from billing_cycle import (  # noqa: F401  (DAMASCUS_OFFSET_HOURS, damascus_today: re-exported)
    DAMASCUS_OFFSET_HOURS, add_months, billing_anchor_of, damascus_today,
)
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.assistant_plan import domain as assistant_plan
from app.dto.common_enums import Currency
from models.common import MONEY_TOLERANCE
from models.common import Account as AccountModel
from models.common import AccountLedgerEntry as LedgerModel
from models.common import ExchangeRate as ExchangeRateModel
from models.common import User as UserModel

log = logging.getLogger("billing")

# A runaway guard, not a policy: the number of periods to raise in one sweep for one
# account. Reached only if an account's creation date is implausibly far in the past
# (a bad import, a clock problem), and the job logs loudly rather than silently
# stopping. Ten years of monthly periods.
MAX_PERIODS_PER_RUN = 120


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
    return billing_anchor_of(account.verified_at, account.created_at)


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


def assistant_plan_charge(uow: SqlAlchemyUnitOfWork, account: AccountModel,
                          period_start: date) -> Optional[ChargeAmount]:
    """The assistant plan's part of a period's charge, in the subscription currency,
    or None when there is nothing to invoice: invoicing is off, the assistant is off
    for the company, or its plan has no price.

    Priced in USD, like the model it pays for, and converted at the company's own
    latest rate on or before the period's first day.
    """
    platform = assistant_plan.platform_settings(uow)
    if not platform["invoice_plans"]:
        return None
    own = assistant_plan.own_settings(uow, [account.uuid]).get(account.uuid)
    company = assistant_plan.plan_for(platform, own)
    price = company.plan.price_usd
    if not company.enabled or not price:
        return None
    currency = account.subscription_currency
    if currency == Currency.USD.value:
        return ChargeAmount(amount=-round(price, 2), note=f"assistant plan {price:.2f} USD")
    rate = _usd_rate(uow, account.uuid, currency, period_start)
    if rate is None:
        raise ValueError(f"no USD->{currency} rate on or before {period_start} to invoice the assistant plan")
    return ChargeAmount(amount=-round(price * rate, 2), note=f"assistant plan {price:.2f} USD at {rate:g}")


def _usd_rate(uow: SqlAlchemyUnitOfWork, account_uuid: str, currency: str, on_or_before: date) -> Optional[float]:
    row = (
        uow.session.query(ExchangeRateModel.rate)
        .filter(
            ExchangeRateModel.account_uuid == account_uuid,
            ExchangeRateModel.is_deleted.is_(False),
            ExchangeRateModel.from_currency == Currency.USD.value,
            ExchangeRateModel.to_currency == currency,
            ExchangeRateModel.rate_date <= on_or_before,
        )
        .order_by(ExchangeRateModel.rate_date.desc())
        .first()
    )
    return float(row[0]) if row else None


def period_charge(uow: SqlAlchemyUnitOfWork, account: AccountModel, period_start: date,
                  base: Optional[float] = None) -> ChargeAmount:
    """Everything one period's charge covers: the subscription and the assistant plan.

    An explicit `base` is a one-off amount an owner typed, and is charged as typed.
    """
    subscription = charge_amount(uow, account, base=base)
    if base is not None:
        return subscription
    plan = assistant_plan_charge(uow, account, period_start)
    if plan is None:
        return subscription
    subscription_note = subscription.note or f"subscription {abs(subscription.amount):.2f}"
    return ChargeAmount(amount=subscription.amount + plan.amount,
                        note=f"{subscription_note}; {plan.note}")


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

    amount, auto_note = period_charge(uow, account, period_start, base=base)
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


# --------------------------------------------------------------------------
# settlement: which charges are paid
# --------------------------------------------------------------------------
#
# A charge is paid when the payments pointing at it cover it. Derived rather than
# stored, for the same reason `Invoice.is_paid` is derived on the customer side: a
# stored flag and the rows it summarises drift apart the first time a payment is
# soft-deleted, and then the ledger disagrees with itself.


def paid_amounts(uow: SqlAlchemyUnitOfWork, charge_uuids: list[str]) -> dict[str, float]:
    """How much has been paid against each of these charges.

    One grouped query for the whole page rather than one per row — the ledger view
    asks this for every charge it renders.
    """
    if not charge_uuids:
        return {}
    rows = (
        uow.session.query(
            LedgerModel.settles_charge_uuid,
            func.coalesce(func.sum(LedgerModel.amount), 0),
        )
        .filter(
            LedgerModel.settles_charge_uuid.in_(charge_uuids),
            LedgerModel.entry_type == "payment",
            LedgerModel.is_deleted.is_(False),
        )
        .group_by(LedgerModel.settles_charge_uuid)
        .all()
    )
    return {uuid_: float(total or 0) for uuid_, total in rows}


def outstanding(charge: LedgerModel, paid: float) -> float:
    """What is still owed on a charge.

    Never negative: an overpayment is a credit on the ACCOUNT, not a negative debt
    on one month, and letting it go below zero would make a single generous payment
    appear to reduce what other months owe.
    """
    return max(0.0, abs(charge.amount) - paid)


def is_paid(charge: LedgerModel, paid: float) -> bool:
    """Settled to within half a cent.

    The same bar the invoice and payment code uses, for the same reason: every money
    column here is DOUBLE PRECISION, so a charge settled in instalments does not land
    bit-exactly on zero, and an exact comparison would leave it forever "not quite
    paid" over dust the UI rounds away.
    """
    return outstanding(charge, paid) <= MONEY_TOLERANCE


def unpaid_charges(uow: SqlAlchemyUnitOfWork,
                   account_uuid: str) -> list[tuple[LedgerModel, float]]:
    """Charges with something still owed, oldest first — the list a payment picks
    from. Oldest first because that is the order anyone settling a debt works in.

    Returns (charge, outstanding) pairs so no caller has to recompute the arithmetic
    and get it slightly different.
    """
    charges = (
        uow.session.query(LedgerModel)
        .filter(
            LedgerModel.account_uuid == account_uuid,
            LedgerModel.entry_type == "charge",
            LedgerModel.is_deleted.is_(False),
        )
        .order_by(LedgerModel.period_start.asc())
        .all()
    )
    paid = paid_amounts(uow, [c.uuid for c in charges])
    return [
        (c, outstanding(c, paid.get(c.uuid, 0.0)))
        for c in charges
        if not is_paid(c, paid.get(c.uuid, 0.0))
    ]
