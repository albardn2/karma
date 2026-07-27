"""Parser tests for the sp-today rate source.

Both hazards these lock down were hit while building the scraper against the
live page, so they are not hypothetical:

1. The page headlines the REDENOMINATED pound (133.50) and gives the old pound
   in parentheses (13,350). Every SYP amount in this database is an old pound,
   so reading the wrong one misprices conversions by exactly 100x.
2. An unanchored buy/sell regex matches 103 pairs on the real page instead of
   26, because the per-city blocks lower down use the same keys. The series
   regex has to be anchored on the date key.
"""
import pytest

from app.domains.exchange_rate.sp_today import (
    ScrapeError,
    parse_series,
    parse_today,
)

# Mirrors the real page's shapes: the headline sentence, the date-anchored chart
# series, and — deliberately — a per-city block using the same buy/sell keys
# with no date, which must NOT be picked up as a data point.
PAGE = """
<p>The current US Dollar (USD) exchange rate in General is 133.50 new SYP
(13,350 old) for buying and 134.25 new SYP (13,425 old) for selling. Rates are
updated continuously.</p>
<script>self.__next_f.push([1,"{\\"ChartData\\":[
{\\"date\\":\\"2026-06-28T23:59:03+03:00\\",\\"timestamp\\":1782680343000,\\"buy\\":12850,\\"sell\\":12950},
{\\"date\\":\\"2026-06-29T23:59:02+03:00\\",\\"timestamp\\":1782766742000,\\"buy\\":13250,\\"sell\\":13350},
{\\"date\\":\\"2026-07-27T23:59:02+03:00\\",\\"timestamp\\":1783198742000,\\"buy\\":13350,\\"sell\\":13425}],
\\"Cities\\":[{\\"name\\":\\"Aleppo\\",\\"buy\\":13300,\\"sell\\":13400},
{\\"name\\":\\"Damascus\\",\\"buy\\":13350,\\"sell\\":13425}]}"])</script>
"""


def test_parse_today_reads_the_old_pound_not_the_headline():
    quote = parse_today(PAGE)
    assert quote.buy_rate == 13350.0
    assert quote.sell_rate == 13425.0
    # not 133.50 / 134.25 — that would be the redenominated pound
    assert quote.buy_rate > 1000


def test_mid_rate_is_the_midpoint():
    assert parse_today(PAGE).mid_rate == 13387.5


def test_new_pound_value_is_refused():
    """If the site drops the old-pound figure, fail loudly rather than store 100x off."""
    page = PAGE.replace("(13,350 old)", "(133 old)").replace("(13,425 old)", "(134 old)")
    with pytest.raises(ScrapeError, match="plausible old-pound band"):
        parse_today(page)


def test_layout_change_raises_rather_than_guessing():
    with pytest.raises(ScrapeError, match="page layout changed"):
        parse_today("<html><body>redesigned</body></html>")


def test_series_ignores_the_per_city_pairs():
    """The Cities block shares the buy/sell keys but has no date; it is not data."""
    series = parse_series(PAGE)
    assert len(series) == 3
    assert [q.rate_date.isoformat() for q in series] == [
        "2026-06-28",
        "2026-06-29",
        "2026-07-27",
    ]


def test_series_is_sorted_oldest_first():
    series = parse_series(PAGE)
    assert series == sorted(series, key=lambda q: q.rate_date)


def test_series_keeps_one_quote_per_date():
    doubled = PAGE.replace(
        '{\\"date\\":\\"2026-06-28T23:59:03+03:00\\",\\"timestamp\\":1782680343000,\\"buy\\":12850,\\"sell\\":12950},',
        '{\\"date\\":\\"2026-06-28T23:59:03+03:00\\",\\"timestamp\\":1782680343000,\\"buy\\":12850,\\"sell\\":12950},'
        '{\\"date\\":\\"2026-06-28T23:59:59+03:00\\",\\"timestamp\\":1782680399000,\\"buy\\":12800,\\"sell\\":12900},',
    )
    series = parse_series(doubled)
    dates = [q.rate_date.isoformat() for q in series]
    assert dates.count("2026-06-28") == 1
    # last occurrence wins, matching how the page orders intraday updates
    assert next(q for q in series if q.rate_date.isoformat() == "2026-06-28").buy_rate == 12800.0


def test_series_missing_entirely_raises():
    with pytest.raises(ScrapeError, match="no daily series"):
        parse_series("<html>no chart here</html>")
