"""Daily platform jobs: subscription charges, and the USD->SYP exchange rate.

Runs as its own compose service on the backend image, the same way
`location_ingest` does:

    entrypoint: ["python", "-m", "daily_tasks"]
    python -m daily_tasks --once      # run everything now and exit

A CONVERGENCE LOOP, NOT A CLOCK. Every tick asks the database what is still
missing for the current Damascus day and does only that. A loop that instead slept
until 02:00 and fired would skip the day entirely if the container happened to
restart at 02:05 — and both deploy paths take the whole stack down, twice. Here the
database is the schedule and the clock only decides how often to look, so a tick
lost to a deploy is picked up by the next one.

That only works because both tasks are idempotent against their own rows: billing
bills from MAX(period_end) and skips an account already covered, and the rate
upserts against a unique index on (account, pair, date).

Why not the alternatives. `cron` inside the image does not inherit the container
environment, so SQLALCHEMY_DATABASE_URI would be unset and every run would die at
import; its output goes to cron's mailer, so `docker compose logs` would show
nothing. APScheduler is a dependency, a lockfile change and an image rebuild to
replace fifteen lines of arithmetic, and its default jobstore is in-memory so it
restarts no better than this. A GitHub Actions schedule would move billing outside
the deployment bundle, needs a long-lived credential, and is auto-disabled after 60
days of repo inactivity.
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import time
from datetime import datetime, timedelta, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("daily-tasks")

ENV = os.getenv("KARMA_ENV", "dev")
TICK_SECONDS = int(os.getenv("DAILY_TASKS_TICK_SECONDS", "1800"))
# sp-today has not published the day's quote in the small hours, and asking too
# early raises rather than returning yesterday's number, so the rate task waits.
# Billing is deliberately NOT gated: it runs the moment the process starts, so an
# outage spanning the small hours is caught up immediately.
RATE_FROM_HOUR = int(os.getenv("DAILY_TASKS_RATE_FROM_HOUR", "5"))
RATE_RETRY_SECONDS = int(os.getenv("DAILY_TASKS_RATE_RETRY_SECONDS", "3600"))
DAMASCUS_OFFSET = timedelta(hours=3)

_stop = False


def _handle_signal(signum, _frame):
    global _stop
    log.info("received signal %s — will exit after the current task", signum)
    _stop = True


def _damascus_hour() -> int:
    return (datetime.now(timezone.utc) + DAMASCUS_OFFSET).hour


def run_once() -> int:
    """Run both tasks unconditionally. Returns a process exit code."""
    from daily_tasks.tasks import run_all

    started = datetime.now(timezone.utc)
    results = run_all()
    failed = [r for r in results if not r.ok]
    log.info(
        "daily tasks finished in %.1fs — %d ok, %d failed",
        (datetime.now(timezone.utc) - started).total_seconds(),
        len(results) - len(failed), len(failed),
    )
    return 1 if failed else 0


def tick() -> None:
    """One pass: do whatever the day is still missing.

    The two halves are in separate try blocks and never share a session. A third
    party being down must not cost a night of billing — an absent rate is an
    inconvenience, an unbilled month is lost revenue. Sharing a session would be
    worse than untidy: the repository layer rolls back the WHOLE session on an
    IntegrityError, so one tenant's rate collision could discard ledger rows.
    """
    from app.domains.billing import domain as billing
    from daily_tasks import tasks

    today = billing.damascus_today()

    global _billed_day, _last_rate_attempt
    if _billed_day != today:
        try:
            result = tasks.charge_due_subscriptions(today)
            log.info("task %s: %s — %s", result.name,
                     "OK" if result.ok else "FAILED", result.detail)
            if result.ok:
                # Only an optimisation to skip a pointless sweep; correctness lives
                # in MAX(period_end), so losing this on restart costs nothing.
                _billed_day = today
        except Exception:
            log.exception("billing task raised")

    if _damascus_hour() < RATE_FROM_HOUR:
        return
    if time.monotonic() - _last_rate_attempt < RATE_RETRY_SECONDS:
        return
    try:
        missing = tasks.accounts_missing_rate(today)
        if not missing:
            return
        _last_rate_attempt = time.monotonic()
        log.info("exchange rate: %d account(s) missing %s", missing, today)
        result = tasks.pull_usd_syp_rate(today)
        log.info("task %s: %s — %s", result.name,
                 "OK" if result.ok else "FAILED", result.detail)
    except Exception:
        log.exception("exchange rate task raised")


_billed_day = None
_last_rate_attempt = 0.0


def main() -> int:
    parser = argparse.ArgumentParser(prog="daily_tasks")
    parser.add_argument("--once", action="store_true",
                        help="run both tasks immediately, ignoring the gates, and exit")
    args = parser.parse_args()

    if args.once:
        return run_once()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    log.info(
        "daily-tasks up (env=%s tick=%ss rate not before %02d:00 Damascus)",
        ENV, TICK_SECONDS, RATE_FROM_HOUR,
    )
    while not _stop:
        try:
            tick()
        except Exception:
            # Never let one bad tick turn `restart: always` into a crash loop that
            # hides the other task forever.
            log.exception("tick failed outright; continuing")
        # Sleep in slices so a redeploy's SIGTERM is answered in seconds rather
        # than waiting out the whole tick.
        waited = 0.0
        while waited < TICK_SECONDS and not _stop:
            time.sleep(min(5, TICK_SECONDS - waited))
            waited += 5
    log.info("daily-tasks stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
