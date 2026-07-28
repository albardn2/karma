"""Lot cost in the currency you asked for.

Every cost contribution is restated in the requested currency at the exchange
rate whose market day is nearest the event's day. Nearest is the normal case,
not a fallback: the source publishes nothing on idle market days, so exact-day
misses are routine. Only a genuine GAP — no rate within a week of the day, and
the day young enough for the source to still have it — triggers an on-the-spot
sp-today pull: at most one per request, and always the full year, so one pull
fixes every gap this request and later ones would hit.

A cost that cannot be converted (no currency on the row, no rate anywhere) is
UNKNOWN, not zero: it is excluded from the average, a lot with nothing knowable
reports cost null (the UI says N/A instead of asserting free goods), and a
process output with an unknowable ingredient is unknowable itself.
"""
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.domains.exchange_rate.domain import ExchangeRateDomain
from app.domains.inventory.domain import InventoryDomain
from app.dto.common_enums import Currency
from app.dto.exchange_rate import BackfillRange
from models.common import ExchangeRate as ExchangeRateModel

from tests.domains.test_lot_cost import _Event, _Lot, _PoItem, _Uow, _enrich, _process

DAY = date(2026, 7, 1)          # the day the standard test _Event is dated
RATE = 134.0                    # USD→SYP on that day, new pounds


def _patch_closest(monkeypatch, rates, calls=None):
    """Replace closest() with one reading a {date: rate} dict, tie→before."""
    def closest(uow=None, from_currency=None, to_currency=None, on=None, **_):
        if calls is not None:
            calls.append(on)
        if not rates:
            return None
        best = min(rates, key=lambda d: (abs((d - on).days), 0 if d <= on else 1))
        return SimpleNamespace(rate=rates[best], rate_date=best)
    monkeypatch.setattr(ExchangeRateDomain, "closest", closest)
    return rates


def _forbid_backfill(monkeypatch):
    def boom(**_kwargs):
        raise AssertionError("backfill should not have fired")
    monkeypatch.setattr(ExchangeRateDomain, "backfill", boom)


def _forbid_closest(monkeypatch):
    def boom(**_kwargs):
        raise AssertionError("closest() should not have been consulted")
    monkeypatch.setattr(ExchangeRateDomain, "closest", boom)


# --- conversion arithmetic --------------------------------------------------


def test_a_usd_receipt_reports_in_syp_at_the_event_days_rate(monkeypatch):
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, cost_per_unit=2, currency="USD")])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit == pytest.approx(2 * RATE)
    assert dto.total_original_cost == pytest.approx(2 * RATE * 100)
    assert dto.cost_currency == Currency.SYP


def test_a_syp_receipt_reports_in_usd_at_the_event_days_rate(monkeypatch):
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, cost_per_unit=268, currency="SYP")])
    dto = _enrich(
        _Uow(lot), "a",
        cost_ctx=InventoryDomain.new_cost_context(currency=Currency.USD),
    )
    assert dto.cost_per_unit == pytest.approx(268 / RATE)
    assert dto.cost_currency == Currency.USD


def test_a_purchase_order_price_converts_from_the_po_currency(monkeypatch):
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, po_item=_PoItem(3, currency="USD"))])
    assert _enrich(_Uow(lot), "a").cost_per_unit == pytest.approx(3 * RATE)


def test_a_mixed_currency_lot_averages_in_one_currency(monkeypatch):
    # 100 @ 134 SYP plus 100 @ 2 USD (= 268 SYP) → 201 SYP, a number that
    # finally means something
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [
        _Event(100, cost_per_unit=134, currency="SYP"),
        _Event(100, cost_per_unit=2, currency="USD"),
    ])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit == pytest.approx((134 * 100 + 268 * 100) / 200)


def test_a_process_output_converts_each_input_at_its_own_day(monkeypatch):
    # 10 units of B bought at 2 USD become 5 units of A, reported in SYP
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    p1 = _process("p1", "b", 10, "a", 5)
    a = _Lot("a", [_Event(5, process=p1)])
    b = _Lot("b", [_Event(10, cost_per_unit=2, currency="USD")])
    assert _enrich(_Uow(a, b), "a").cost_per_unit == pytest.approx(2 * RATE * 10 / 5)


def test_same_currency_costs_never_touch_the_rate_table(monkeypatch):
    _forbid_closest(monkeypatch)
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, cost_per_unit=10, currency="SYP")])
    assert _enrich(_Uow(lot), "a").cost_per_unit == pytest.approx(10)


def test_a_zero_cost_needs_no_rate_and_stays_known(monkeypatch):
    # 0 is 0 in every currency: with the rate table empty and the source
    # unreachable, the free USD receipt still averages against the SYP one
    _patch_closest(monkeypatch, {})
    _forbid_backfill_called = []
    monkeypatch.setattr(
        ExchangeRateDomain, "backfill",
        lambda **kw: _forbid_backfill_called.append(1) or (_ for _ in ()).throw(Exception("down")),
    )
    lot = _Lot("a", [
        _Event(100, cost_per_unit=0, currency="USD"),
        _Event(100, cost_per_unit=10, currency="SYP"),
    ])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit == pytest.approx((0 + 10 * 100) / 200)


def test_a_cost_with_no_currency_is_unknown_not_assumed(monkeypatch):
    # guessing SYP would be 100x wrong for rows that predate the
    # redenomination's labelling; nothing knowable at all -> cost is null
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, cost_per_unit=10, currency=None)])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit is None
    assert dto.total_original_cost is None


def test_a_currency_this_code_cannot_convert_is_unknown_too(monkeypatch):
    _patch_closest(monkeypatch, {DAY: RATE})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, cost_per_unit=10, currency="EUR")])
    assert _enrich(_Uow(lot), "a").cost_per_unit is None


def test_one_rate_lookup_serves_every_event_on_that_day(monkeypatch):
    calls = []
    _patch_closest(monkeypatch, {DAY: RATE}, calls=calls)
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [
        _Event(100, cost_per_unit=2, currency="USD"),
        _Event(50, cost_per_unit=4, currency="USD"),
    ])
    _enrich(_Uow(lot), "a")
    assert len(calls) == 1


def test_an_unknowable_ingredient_makes_the_process_output_unknown(monkeypatch):
    # process P consumes A (cost set but currency NULL -> unknowable) and the
    # output lands in L; L's own priced receipt must not be diluted by a
    # confident zero from P
    _forbid_backfill(monkeypatch)
    _patch_closest(monkeypatch, {DAY: RATE})
    p = _process("p", "a", 10, "l", 50)
    a = _Lot("a", [_Event(10, cost_per_unit=7, currency=None)])
    l = _Lot("l", [
        _Event(50, process=p),
        _Event(100, cost_per_unit=10, currency="SYP"),
    ])
    dto = _enrich(_Uow(a, l), "l")
    assert dto.cost_per_unit == pytest.approx(10)


# --- the gap policy: nearest first, one full-year pull only for real gaps ---


def test_a_rate_a_few_days_away_is_used_without_pulling(monkeypatch):
    _patch_closest(monkeypatch, {DAY - timedelta(days=3): 120.0})
    _forbid_backfill(monkeypatch)
    lot = _Lot("a", [_Event(100, cost_per_unit=2, currency="USD")])
    assert _enrich(_Uow(lot), "a").cost_per_unit == pytest.approx(240)


def test_a_real_gap_pulls_the_full_year_once(monkeypatch):
    calls = []
    rates = _patch_closest(monkeypatch, {})

    def fake_backfill(uow, backfill_range, **_kwargs):
        calls.append(backfill_range)
        rates[DAY] = RATE
        rates[date(2026, 6, 1)] = 130.0

    monkeypatch.setattr(ExchangeRateDomain, "backfill", fake_backfill)

    other_day = datetime(2026, 6, 1)
    lot = _Lot("a", [
        _Event(100, cost_per_unit=2, currency="USD"),
        _Event(100, cost_per_unit=2, currency="USD", created_at=other_day),
    ])
    ctx = InventoryDomain.new_cost_context()
    dto = _enrich(_Uow(lot), "a", cost_ctx=ctx)

    assert calls == [BackfillRange.ONE_YEAR]
    assert ctx["rates_ingested"] is True
    # each event converted at its own day's rate from the single pull
    assert dto.cost_per_unit == pytest.approx((2 * RATE * 100 + 2 * 130.0 * 100) / 200)


def test_the_pull_is_attempted_at_most_once_per_request(monkeypatch):
    calls = []
    rates = _patch_closest(monkeypatch, {})

    def fake_backfill(uow, backfill_range, **_kwargs):
        calls.append(backfill_range)
        rates[DAY] = RATE  # the pull happens to cover only one of the days

    monkeypatch.setattr(ExchangeRateDomain, "backfill", fake_backfill)

    lot = _Lot("a", [
        _Event(100, cost_per_unit=2, currency="USD"),
        _Event(100, cost_per_unit=2, currency="USD", created_at=datetime(2026, 1, 5)),
    ])
    dto = _enrich(_Uow(lot), "a")
    assert len(calls) == 1
    # the uncovered day settles for the nearest recorded rate
    assert dto.cost_per_unit == pytest.approx(2 * RATE)


def test_days_beyond_the_sources_reach_never_trigger_a_pull(monkeypatch):
    _forbid_backfill(monkeypatch)
    old_day = datetime.combine(date.today() - timedelta(days=500), datetime.min.time())
    _patch_closest(monkeypatch, {date.today() - timedelta(days=360): 110.0})
    lot = _Lot("a", [_Event(100, cost_per_unit=2, currency="USD", created_at=old_day)])
    assert _enrich(_Uow(lot), "a").cost_per_unit == pytest.approx(220)


def test_a_dead_rate_source_falls_back_to_the_nearest_recorded_day(monkeypatch):
    from app.entrypoint.routes.common.errors import BadRequestError

    _patch_closest(monkeypatch, {DAY - timedelta(days=60): 100.0})
    monkeypatch.setattr(
        ExchangeRateDomain, "backfill",
        lambda **_kwargs: (_ for _ in ()).throw(BadRequestError("sp-today is down")),
    )
    lot = _Lot("a", [_Event(100, cost_per_unit=2, currency="USD")])
    ctx = InventoryDomain.new_cost_context()
    dto = _enrich(_Uow(lot), "a", cost_ctx=ctx)
    assert dto.cost_per_unit == pytest.approx(200)
    assert ctx["rates_ingested"] is False


def test_no_rate_anywhere_means_unknown_cost_not_a_crash(monkeypatch):
    from app.entrypoint.routes.common.errors import BadRequestError

    _patch_closest(monkeypatch, {})
    monkeypatch.setattr(
        ExchangeRateDomain, "backfill",
        lambda **_kwargs: (_ for _ in ()).throw(BadRequestError("down")),
    )
    lot = _Lot("a", [
        _Event(100, cost_per_unit=2, currency="USD"),
        _Event(100, cost_per_unit=134, currency="SYP"),
    ])
    dto = _enrich(_Uow(lot), "a")
    # the USD receipt is unknowable; the SYP one still answers
    assert dto.cost_per_unit == pytest.approx(134)


# --- picking the nearest market day (real query, real SQLite) ---------------

ACCOUNT = "acct-1"


def _rates_uow(rows):
    """A UoW over an in-memory SQLite with just the exchange_rate table."""
    engine = create_engine("sqlite://")
    ExchangeRateModel.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    for rate_date, rate, account, is_deleted in rows:
        session.add(ExchangeRateModel(
            account_uuid=account,
            from_currency="USD",
            to_currency="SYP",
            rate=rate,
            rate_date=rate_date,
            source="manual",
            is_deleted=is_deleted,
        ))
    session.commit()
    return SimpleNamespace(session=session, account_uuid=ACCOUNT)


def _closest_rate(rows, on):
    row = ExchangeRateDomain.closest(
        uow=_rates_uow(rows), from_currency=Currency.USD,
        to_currency=Currency.SYP, on=on,
    )
    return row.rate if row else None


def test_the_exact_day_wins_when_it_exists():
    rows = [(date(2026, 7, 1), 134, ACCOUNT, False),
            (date(2026, 7, 2), 200, ACCOUNT, False)]
    assert _closest_rate(rows, date(2026, 7, 1)) == 134


def test_the_nearer_later_day_beats_the_farther_earlier_one():
    rows = [(date(2026, 6, 20), 120, ACCOUNT, False),
            (date(2026, 7, 3), 140, ACCOUNT, False)]
    assert _closest_rate(rows, date(2026, 7, 1)) == 140


def test_a_tie_prefers_the_day_already_in_effect():
    rows = [(date(2026, 6, 29), 120, ACCOUNT, False),
            (date(2026, 7, 3), 140, ACCOUNT, False)]
    assert _closest_rate(rows, date(2026, 7, 1)) == 120


def test_only_later_days_still_answer():
    rows = [(date(2026, 8, 1), 150, ACCOUNT, False)]
    assert _closest_rate(rows, date(2026, 7, 1)) == 150


def test_other_tenants_and_deleted_rows_are_invisible():
    rows = [(date(2026, 7, 1), 999, "someone-else", False),
            (date(2026, 7, 1), 888, ACCOUNT, True),
            (date(2026, 6, 1), 134, ACCOUNT, False)]
    assert _closest_rate(rows, date(2026, 7, 1)) == 134


def test_an_empty_table_answers_none():
    assert _closest_rate([], date(2026, 7, 1)) is None


# --- pulls must not clobber hand-corrected rates -----------------------------


def test_a_pull_never_overwrites_a_manual_rate():
    """Reads can trigger pulls now, so a scrape quietly reverting a rate
    someone fixed by hand would lose the correction with no record."""
    from app.dto.exchange_rate import ExchangeRateCreate, ExchangeRateSource

    manual = SimpleNamespace(source="manual", rate=125.0, buy_rate=None,
                             sell_rate=None, notes="hand-checked")

    class _Repo:
        def __init__(self):
            self.saved = None

        def find_one(self, **_kwargs):
            return manual

        def save(self, model, commit=False):
            self.saved = model

    uow = SimpleNamespace(exchange_rate_repository=_Repo())
    payload = ExchangeRateCreate(
        from_currency=Currency.USD, to_currency=Currency.SYP,
        rate=999.0, rate_date=DAY, source=ExchangeRateSource.SP_TODAY,
    )
    row, created = ExchangeRateDomain.upsert(uow, payload)
    assert created is False
    assert row.rate == 125.0
    assert uow.exchange_rate_repository.saved is None
