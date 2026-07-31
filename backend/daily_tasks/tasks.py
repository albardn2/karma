"""The work the daily job does. Separated from the scheduler so it is testable.

Each task is independent and returns a summary. A task that raises must not stop
the other from running — a day with no exchange rate is an inconvenience, a day
with no subscription charge is lost revenue, and neither should be able to take
the other down with it.

Every task here is IDEMPOTENT. That is not a nicety: the process is `restart:
always` in compose, so a crash or a redeploy near the firing time can run a task
twice, and both tasks are the kind that would otherwise duplicate money rows or
rate rows.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import NamedTuple, Optional

from sqlalchemy import text

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.billing import domain as billing
from app.domains.exchange_rate import sp_today
from app.domains.exchange_rate.domain import ExchangeRateDomain
from app.dto.common_enums import Currency
from models.common import Account as AccountModel

log = logging.getLogger("daily-tasks")


class TaskResult(NamedTuple):
    name: str
    ok: bool
    detail: str


# --------------------------------------------------------------------------
# 1. subscription charges
# --------------------------------------------------------------------------

def charge_due_subscriptions(today: Optional[date] = None) -> TaskResult:
    """Bill every verified account whose cover has run out.

    Runs unscoped (account_uuid=None) because it works across all tenants — the
    ledger is platform data, not tenant data, and is reached only this way and
    through the super-admin console.

    ONE TRANSACTION PER ACCOUNT, deliberately, not one for the sweep. Both deploy
    paths run `docker compose down` with the default 10-second grace and no
    stop_grace_period, so a SIGTERM part-way through a single big transaction would
    discard the whole night's billing rather than one account. Per-account commits
    mean an abrupt death loses at most the account in flight, and the next tick
    re-derives its window from the database.
    """
    today = today or billing.damascus_today()
    charged = skipped_covered = skipped_unconfigured = 0
    failed: list[str] = []

    # Snapshot the account list in its own short transaction, so the sweep is not
    # holding a connection open across every per-account commit.
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        accounts = [(a.uuid, a.company_name) for a in billing.billable_accounts(uow)]
    log.info("billing: %d verified account(s) to consider for %s", len(accounts), today)

    for account_uuid, company_name in accounts:
        try:
            with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
                # Per-account mutex held to commit. The predicate is read-then-write,
                # which is not safe under READ COMMITTED if two runners overlap — a
                # restart near the firing time, or someone running --once alongside
                # the service. The partial unique index on (account_uuid,
                # period_start) is the second line of defence; this is the first,
                # because it makes the loser wait rather than fail.
                uow.session.execute(
                    text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
                    {"k": f"subscription_charge:{account_uuid}"},
                )

                window = billing.next_period(uow, account_uuid, today)
                if window is None:
                    skipped_covered += 1
                    continue

                account = uow.session.query(AccountModel).filter(
                    AccountModel.uuid == account_uuid
                ).one()

                # Not an error, but it must be visible: an account with no rate can
                # never be billed, and a silent skip would hide that forever.
                if account.subscription_rate is None or not account.subscription_currency:
                    skipped_unconfigured += 1
                    log.warning(
                        "billing: %s (%s) is due but has no subscription rate/currency"
                        " — skipping", company_name, account_uuid,
                    )
                    continue

                period_start, period_end = window
                entry = billing.create_charge(
                    uow, account, period_start, period_end, created_by_uuid=None
                )
                uow.commit()
                # Read the values out BEFORE the session closes. The UnitOfWork's
                # __exit__ closes the session, which detaches the instance, and
                # touching a detached attribute raises — so logging these after the
                # block reported every SUCCESSFUL charge as a failure. The money was
                # right and the summary was wrong, which also meant the loop never
                # marked the day done and re-swept every tick.
                amount, currency = entry.amount, entry.currency

            charged += 1
            log.info(
                "billing: charged %s (%s) %.2f %s for %s..%s",
                company_name, account_uuid, amount, currency,
                period_start, period_end,
            )
        except Exception as exc:  # noqa: BLE001 — one account must not sink the sweep
            failed.append(f"{company_name}: {exc}")
            log.exception("billing: account %s failed", account_uuid)

    detail = (
        f"charged {charged}, already covered {skipped_covered}, "
        f"unconfigured {skipped_unconfigured}"
    )
    if failed:
        return TaskResult("charge_due_subscriptions", False,
                          f"{detail}; failed: {'; '.join(failed)}")
    return TaskResult("charge_due_subscriptions", True, detail)


# --------------------------------------------------------------------------
# 2. USD -> SYP exchange rate
# --------------------------------------------------------------------------

def accounts_missing_rate(day: date) -> int:
    """How many live accounts still have no USD->SYP row for `day`.

    The rate task's only trigger, so a tick on a day whose rate is already stored
    everywhere does not touch sp-today at all. It also makes the work self-healing:
    a tick lost to a deploy leaves this non-zero and the next tick picks it up.
    """
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        return uow.session.execute(text("""
            SELECT count(*) FROM account a
             WHERE a.is_deleted IS NOT TRUE
               AND NOT EXISTS (
                 SELECT 1 FROM exchange_rate r
                  WHERE r.account_uuid = a.uuid
                    AND r.from_currency = 'USD' AND r.to_currency = 'SYP'
                    AND r.rate_date = :day AND r.is_deleted IS NOT TRUE)
        """), {"day": day}).scalar() or 0


def pull_usd_syp_rate(today: Optional[date] = None) -> TaskResult:
    """Fetch today's rate ONCE, then store it for every tenant.

    `exchange_rate.account_uuid` is NOT NULL — rates are tenant rows even though
    the market is the same for everyone — so this writes one row per account. It
    deliberately does not call `ExchangeRateDomain.pull_today()` per account,
    which would fetch from sp-today once per tenant and hammer a third party for
    identical data.

    Rates are written for every live account including unverified ones: they are
    reference data the transaction form reads, they cost almost nothing, and an
    account verified next month is better off with the history already in place
    than with a gap it can never backfill by hand.
    """
    try:
        quote = sp_today.fetch_today()
    except sp_today.ScrapeError as exc:
        # The source being down is not a bug here. Report and let tomorrow's run
        # pick it up; the backfill route exists for filling a longer gap.
        log.error("exchange rate: could not read sp-today: %s", exc)
        return TaskResult("pull_usd_syp_rate", False, f"source unavailable: {exc}")

    log.info("exchange rate: sp-today says %s -> mid %s (buy %s / sell %s), new pounds",
             quote.rate_date, quote.mid_rate, quote.buy_rate, quote.sell_rate)
    if today is not None and quote.rate_date != today:
        # The source's endpoint can return a point dated the previous day (its
        # timestamps come in two shapes — see tests/domains/test_sp_today_parser).
        # Store it under its own date rather than mislabelling it, and let the
        # caller's retry keep asking until the real day appears.
        log.warning(
            "exchange rate: source returned %s, not today (%s) — storing under its "
            "own date and leaving today unfilled", quote.rate_date, today,
        )

    written = 0
    failed: list[str] = []
    unscoped = SqlAlchemyUnitOfWork(account_uuid=None)
    with unscoped:
        account_uuids = [
            row[0] for row in unscoped.session.query(AccountModel.uuid)
            .filter(AccountModel.is_deleted.is_(False))
            .all()
        ]

    for account_uuid in account_uuids:
        # A UoW per account, because _ingest stamps the row from the UoW's scope.
        # Also isolates the failure: one tenant's bad row cannot lose the rest.
        try:
            uow = SqlAlchemyUnitOfWork(account_uuid=account_uuid)
            with uow:
                ExchangeRateDomain.store_quotes(uow, [quote], created_by_uuid=None)
                uow.commit()
            written += 1
        except Exception as exc:  # noqa: BLE001 — one tenant must not sink the sweep
            failed.append(f"{account_uuid}: {exc}")
            log.exception("exchange rate: failed for account %s", account_uuid)

    detail = (f"{quote.rate_date} mid {quote.mid_rate} stored for {written}/{len(account_uuids)} account(s)")
    if failed:
        return TaskResult("pull_usd_syp_rate", False, f"{detail}; failed: {'; '.join(failed)}")
    return TaskResult("pull_usd_syp_rate", True, detail)


# --------------------------------------------------------------------------

TASKS = (charge_due_subscriptions, pull_usd_syp_rate)


def run_all() -> list[TaskResult]:
    """Run every task, isolating failures so one cannot prevent the others."""
    results = []
    for task in TASKS:
        try:
            result = task()
        except Exception as exc:  # noqa: BLE001 — the whole point of the isolation
            log.exception("task %s raised", task.__name__)
            result = TaskResult(task.__name__, False, f"raised: {exc}")
        results.append(result)
        log.info("task %s: %s — %s", result.name, "OK" if result.ok else "FAILED", result.detail)
    return results
