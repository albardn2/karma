"""Subscription charges against the platform ledger.

Two callers raise charges and they must agree: the super-admin console, where an
owner clicks a button, and the daily job, which bills every account that has
fallen out of coverage. The amount arithmetic lives here rather than in either of
them, because a charge computed two slightly different ways is the kind of bug
nobody notices until a customer disputes an invoice.

A charge covers a half-open ROLLING window, [period_start, period_end) — thirty
days from wherever the previous one ended. Not a calendar month: a company that
signs up on the 28th is entitled to thirty days, and the daily job needs to ask
"is this account covered for the days ahead", which a month label cannot answer.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import NamedTuple, Optional

from sqlalchemy import func

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import Account as AccountModel
from models.common import AccountLedgerEntry as LedgerModel
from models.common import User as UserModel

# One subscription period. Thirty days rather than a calendar month, so every
# account gets the same amount of service for the same money regardless of when
# it signed up.
PERIOD_DAYS = 30

# The business runs in Damascus (UTC+3) and the servers run UTC, so "today" has to
# be pinned to the business day or a job firing in the evening bills for yesterday.
# Same offset the trip-name default uses.
DAMASCUS_OFFSET_HOURS = 3


def damascus_today() -> date:
    from datetime import datetime, timezone
    return (datetime.now(timezone.utc) + timedelta(hours=DAMASCUS_OFFSET_HOURS)).date()


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


def covered_until(uow: SqlAlchemyUnitOfWork, account_uuid: str) -> Optional[date]:
    """The last day this account's charges reach, or None if never charged.

    Reads MAX(period_end) over live charges. Rows predating the range columns were
    backfilled from their month label by migration e7b41d20fa96 precisely so this
    cannot silently miss them — SQL MAX ignores NULLs, so an unbackfilled charge
    would read as "never billed" and get billed again.
    """
    return (
        uow.session.query(func.max(LedgerModel.period_end))
        .filter(
            LedgerModel.account_uuid == account_uuid,
            LedgerModel.entry_type == "charge",
            LedgerModel.is_deleted.is_(False),
        )
        .scalar()
    )


def next_period(uow: SqlAlchemyUnitOfWork, account_uuid: str,
                today: date) -> Optional[tuple[date, date]]:
    """The window to bill now, or None when the account is already covered.

    The rule, and the whole of the job's idempotency: bill from wherever cover ran
    out, and only once it has. An account never charged starts today. An account
    whose cover still reaches beyond today is left alone — which is what makes
    running this twice in one day, or twice in one minute, harmless.

    Starting from the previous `period_end` rather than from today is deliberate:
    it keeps consecutive periods exactly contiguous, so a subscription has neither
    an unbilled gap nor a double-billed overlap even if the job misses a day.
    """
    until = covered_until(uow, account_uuid)
    if until is None:
        start = today
    elif until > today:
        return None
    else:
        start = until
    return start, start + timedelta(days=PERIOD_DAYS)


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
