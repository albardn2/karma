from datetime import date
from typing import Optional, Tuple

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.exchange_rate import sp_today
from app.dto.common_enums import Currency
from app.dto.exchange_rate import (
    BackfillRange,
    ExchangeRateCreate,
    ExchangeRatePullResult,
    ExchangeRateRead,
    ExchangeRateSource,
)
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import ExchangeRate as ExchangeRateModel

# sp-today publishes the Syrian market rate for the dollar; that is the only
# pair we can pull today. Everything else has to be entered by hand.
PULLABLE_PAIR = (Currency.USD, Currency.SYP)


class ExchangeRateDomain:

    @staticmethod
    def _pullable_or_raise(from_currency: Currency, to_currency: Currency) -> None:
        if (from_currency, to_currency) != PULLABLE_PAIR:
            raise BadRequestError(
                f"Only {PULLABLE_PAIR[0].value} to {PULLABLE_PAIR[1].value} can be "
                f"pulled from sp-today; add other pairs manually"
            )

    @staticmethod
    def upsert(
        uow: SqlAlchemyUnitOfWork, payload: ExchangeRateCreate
    ) -> Tuple[ExchangeRateModel, bool]:
        """Write one day's rate, replacing that day's value if it exists.

        Re-pulling a day has to be harmless — the button is right there, and the
        partial unique index would otherwise raise an integrity error. Returns
        (row, created) so callers can report created vs updated honestly.
        """
        existing = uow.exchange_rate_repository.find_one(
            from_currency=payload.from_currency.value,
            to_currency=payload.to_currency.value,
            rate_date=payload.rate_date,
            is_deleted=False,
        )
        if existing:
            # a hand-entered rate outranks the scraper: pulls can now be
            # triggered by mere reads (the costing gap-fill), and silently
            # reverting a correction to the site's number would lose it with
            # no record
            if (
                existing.source == ExchangeRateSource.MANUAL.value
                and payload.source == ExchangeRateSource.SP_TODAY
            ):
                return existing, False
            existing.rate = payload.rate
            existing.buy_rate = payload.buy_rate
            existing.sell_rate = payload.sell_rate
            existing.source = payload.source.value
            if payload.notes is not None:
                existing.notes = payload.notes
            uow.exchange_rate_repository.save(model=existing, commit=False)
            return existing, False

        row = ExchangeRateModel(
            **payload.model_dump(mode='json', exclude={'rate_date'}),
            rate_date=payload.rate_date,
        )
        uow.exchange_rate_repository.save(model=row, commit=False)
        return row, True

    @staticmethod
    def latest(
        uow: SqlAlchemyUnitOfWork,
        from_currency: Currency,
        to_currency: Currency,
        on_or_before: Optional[date] = None,
    ) -> Optional[ExchangeRateModel]:
        """Most recent rate for a pair, optionally as of a date.

        A raw query, so it filters account_uuid itself — the repository scoping
        that `find_one` gets for free does not apply here.
        """
        query = uow.session.query(ExchangeRateModel).filter(
            ExchangeRateModel.account_uuid == uow.account_uuid,
            ExchangeRateModel.is_deleted == False,  # noqa: E712
            ExchangeRateModel.from_currency == from_currency.value,
            ExchangeRateModel.to_currency == to_currency.value,
        )
        if on_or_before:
            query = query.filter(ExchangeRateModel.rate_date <= on_or_before)
        return query.order_by(ExchangeRateModel.rate_date.desc()).first()

    @staticmethod
    def closest(
        uow: SqlAlchemyUnitOfWork,
        from_currency: Currency,
        to_currency: Currency,
        on: date,
    ) -> Optional[ExchangeRateModel]:
        """The rate whose market day is nearest to `on`, in either direction.

        Costing wants the rate in effect around the day stock moved, and the
        source skips days the market did not move — so an exact-day lookup
        would miss constantly. A tie prefers the earlier day (the rate that
        was actually in effect when the day started).

        A raw query, so it filters account_uuid itself — the repository scoping
        that `find_one` gets for free does not apply here.
        """
        base = uow.session.query(ExchangeRateModel).filter(
            ExchangeRateModel.account_uuid == uow.account_uuid,
            ExchangeRateModel.is_deleted == False,  # noqa: E712
            ExchangeRateModel.from_currency == from_currency.value,
            ExchangeRateModel.to_currency == to_currency.value,
        )
        before = (
            base.filter(ExchangeRateModel.rate_date <= on)
            .order_by(ExchangeRateModel.rate_date.desc())
            .first()
        )
        after = (
            base.filter(ExchangeRateModel.rate_date > on)
            .order_by(ExchangeRateModel.rate_date.asc())
            .first()
        )
        if before is None:
            return after
        if after is None:
            return before
        if (on - before.rate_date) <= (after.rate_date - on):
            return before
        return after

    @staticmethod
    def _ingest(
        uow: SqlAlchemyUnitOfWork,
        quotes,
        created_by_uuid: Optional[str],
        range_used: Optional[BackfillRange] = None,
    ) -> ExchangeRatePullResult:
        from_currency, to_currency = PULLABLE_PAIR
        created = updated = 0
        rows = []
        for quote in quotes:
            payload = ExchangeRateCreate(
                from_currency=from_currency,
                to_currency=to_currency,
                rate=quote.mid_rate,
                buy_rate=quote.buy_rate,
                sell_rate=quote.sell_rate,
                rate_date=quote.rate_date,
                source=ExchangeRateSource.SP_TODAY,
                created_by_uuid=created_by_uuid,
            )
            row, was_created = ExchangeRateDomain.upsert(uow, payload)
            created += 1 if was_created else 0
            updated += 0 if was_created else 1
            rows.append(row)

        dates = sorted(q.rate_date for q in quotes)
        return ExchangeRatePullResult(
            created=created,
            updated=updated,
            from_currency=from_currency,
            to_currency=to_currency,
            source=ExchangeRateSource.SP_TODAY.value,
            range=range_used,
            first_date=dates[0] if dates else None,
            last_date=dates[-1] if dates else None,
            exchange_rates=[ExchangeRateRead.from_orm(r) for r in rows],
        )

    @staticmethod
    def pull_today(
        uow: SqlAlchemyUnitOfWork,
        created_by_uuid: Optional[str] = None,
        from_currency: Currency = Currency.USD,
        to_currency: Currency = Currency.SYP,
    ) -> ExchangeRatePullResult:
        ExchangeRateDomain._pullable_or_raise(from_currency, to_currency)
        try:
            quote = sp_today.fetch_today()
        except sp_today.ScrapeError as exc:
            # a source that changed shape or went down is a bad gateway, not a
            # server bug, and the message says which
            raise BadRequestError(f"Could not read the rate from sp-today: {exc}")
        return ExchangeRateDomain._ingest(uow, [quote], created_by_uuid)

    @staticmethod
    def backfill(
        uow: SqlAlchemyUnitOfWork,
        created_by_uuid: Optional[str] = None,
        from_currency: Currency = Currency.USD,
        to_currency: Currency = Currency.SYP,
        backfill_range: BackfillRange = BackfillRange.ONE_MONTH,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> ExchangeRatePullResult:
        """Ingest the daily history for a range, optionally clipped further.

        `backfill_range` decides how far back the source is asked to go (a year
        at most); `start`/`end` then narrow what came back. Days the market did
        not move are simply absent, so a year is ~299 points, not 365.
        """
        ExchangeRateDomain._pullable_or_raise(from_currency, to_currency)
        try:
            quotes = sp_today.fetch_history(backfill_range.value)
        except sp_today.ScrapeError as exc:
            raise BadRequestError(f"Could not read the history from sp-today: {exc}")

        if start:
            quotes = [q for q in quotes if q.rate_date >= start]
        if end:
            quotes = [q for q in quotes if q.rate_date <= end]
        if not quotes:
            raise BadRequestError(
                f"sp-today published no rates for range {backfill_range.value} "
                f"within that start/end window"
            )
        return ExchangeRateDomain._ingest(
            uow, quotes, created_by_uuid, range_used=backfill_range
        )

    @staticmethod
    def delete(uow: SqlAlchemyUnitOfWork, uuid: str) -> ExchangeRateRead:
        row = uow.exchange_rate_repository.find_one(uuid=uuid, is_deleted=False)
        if not row:
            from app.entrypoint.routes.common.errors import NotFoundError
            raise NotFoundError(f"Exchange rate with uuid {uuid} not found")
        row.is_deleted = True
        uow.exchange_rate_repository.save(model=row, commit=False)
        return ExchangeRateRead.from_orm(row)
