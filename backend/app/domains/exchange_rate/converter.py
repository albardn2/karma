"""One place that turns money in one currency into money in another, at a date.

This is the money-layer promotion of the conversion that inventory costing has
done for a while (InventoryDomain._usd_syp_rate_for_day / _unit_cost_in_target).
Dashboards restate revenue, spend and debt into a single reporting currency, and
the rule that math must obey is the same one costing already follows:

  - the rate is the one whose market day is NEAREST the amount's own day, in
    either direction and with no distance cap — the market does not move every
    day, so an exact-day lookup would miss constantly. `ExchangeRateDomain.closest`
    already answers exactly this.
  - a genuine hole (no rate within a week, and the day young enough that the
    source could still reach it) triggers ONE backfill per converter instance,
    always the full year, so a single pull fixes every gap this request and every
    later one will hit.
  - when there is no usable rate at all, or the currency is one this system does
    not convert, the answer is None — "unknown", never a fabricated number and
    never silently zero. The caller decides what to do with an unknown; it must
    not average a wrong figure into a total.

Rates are per-account (ExchangeRate.account_uuid is NOT NULL), so a converter is
scoped to whatever account the unit of work is scoped to.

WHY THIS DOES NOT SUM ACROSS CURRENCIES BLINDLY. The app's standing rule is that
SYP and USD are never added together — they are ~orders of magnitude apart, and a
July 2026 redenomination divided every SYP figure (and every stored SYP rate) by
100. Converting each amount at its OWN day's rate before summing is the one way to
combine them honestly: both sides of the multiply are post-redenomination
new-pounds, so the conversion never straddles that boundary, and the result is a
real single-currency total rather than a meaningless mixed sum.
"""

from __future__ import annotations

from datetime import date as date_type
from typing import Optional

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.exchange_rate.domain import ExchangeRateDomain
from app.dto.common_enums import Currency
from app.dto.exchange_rate import BackfillRange


class CurrencyConverter:
    """Convert amounts into one target currency, caching each day's rate.

    One instance per request: the rate cache and the backfill-once latch both
    live on it, so a dashboard that converts thousands of orders across a window
    does at most one rate lookup per distinct day and at most one backfill pull.
    """

    # A rate within this many days of the amount is "the rate in effect"; the
    # source skips idle market days, so a miss inside this window is normal and
    # is NOT a reason to go pull data. Mirrors InventoryDomain.
    RATE_GAP_TOLERANCE_DAYS = 7
    # sp-today's history bottoms out around a year; a pull can never reach
    # further, so never fire one for older days.
    RATE_SOURCE_REACH_DAYS = 365

    def __init__(self, uow: SqlAlchemyUnitOfWork, target: Currency):
        self.uow = uow
        self.target = target
        self._rates: dict = {}          # day -> USD->SYP rate, or None
        self._backfill_attempted = False
        # observability for the caller: did we have to pull, and did any amount
        # come back unconvertible
        self.rates_ingested = False

    def _usd_syp_rate_for_day(self, day: date_type) -> Optional[float]:
        """USD→SYP rate for one market day, cached, with a single backfill on a gap.

        Never raises: a dashboard tile must not 500 because sp-today is down.
        """
        if day in self._rates:
            return self._rates[day]

        row = ExchangeRateDomain.closest(
            uow=self.uow, from_currency=Currency.USD, to_currency=Currency.SYP, on=day
        )
        gap_is_fine = (
            row is not None
            and abs((row.rate_date - day).days) <= self.RATE_GAP_TOLERANCE_DAYS
        )
        source_can_reach = (date_type.today() - day).days <= self.RATE_SOURCE_REACH_DAYS
        if not gap_is_fine and source_can_reach and not self._backfill_attempted:
            self._backfill_attempted = True
            try:
                ExchangeRateDomain.backfill(uow=self.uow, backfill_range=BackfillRange.ONE_YEAR)
                self.rates_ingested = True
                row = (
                    ExchangeRateDomain.closest(
                        uow=self.uow,
                        from_currency=Currency.USD,
                        to_currency=Currency.SYP,
                        on=day,
                    )
                    or row
                )
            except Exception:
                # unreachable source is a missing rate, not a crash
                pass

        rate = row.rate if row else None
        self._rates[day] = rate
        return rate

    def convert(self, amount, source_currency, on) -> Optional[float]:
        """`amount` restated in the target currency, or None if it cannot be.

        None means "unknown" — no source currency, a currency this system does
        not convert, or no usable rate anywhere near the day. The caller excludes
        it rather than averaging in a number off by a factor of the rate.
        """
        if amount is None:
            return None
        if amount == 0:
            # zero is zero in every currency, and needs no rate — so a real
            # zero stays known even when the rate table cannot answer
            return 0.0
        if source_currency is None:
            return None
        try:
            source = Currency(source_currency)
        except ValueError:
            return None
        if source == self.target:
            return float(amount)

        day = on.date() if hasattr(on, "date") else on
        rate = self._usd_syp_rate_for_day(day)
        if rate is None or rate <= 0:
            return None
        if source == Currency.SYP and self.target == Currency.USD:
            return float(amount) / rate
        if source == Currency.USD and self.target == Currency.SYP:
            return float(amount) * rate
        # any other pair is unconvertible today (USD<->SYP is the only pair the
        # rate table holds); unknown, not a guess
        return None
