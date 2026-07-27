"""Tests for the sp-today rate source.

Every hazard here was hit for real while building against the live endpoint:

1. The site headlines the REDENOMINATED pound (133.50) while this endpoint
   returns the OLD one (13,350). Every SYP amount in this database is an old
   pound, so reading the wrong unit misprices conversions by exactly 100x.
2. An unrecognised range does NOT error — /api/historical answers 200 with about
   a month of data. `range=2y` and `range=5y` both return 26 points. So a range
   must never be forwarded from a caller unchecked, or a "year" backfill quietly
   stores a month.
3. The same endpoint returns two date shapes: "2026-07-27T23:59:02+03:00" and
   "2026-07-28 00:02:03".
4. A day can carry several intraday points; the last is that day's close.
"""
import json
from datetime import date

import pytest

from app.domains.exchange_rate import sp_today
from app.domains.exchange_rate.sp_today import RANGES, ScrapeError, fetch_history


def _payload(points):
    return json.dumps(points).encode("utf-8")


class _FakeResponse:
    def __init__(self, body):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def source(monkeypatch):
    """Serve a canned payload and record the URL that was requested."""
    calls = []

    def fake_urlopen(request, timeout=None):
        calls.append(request.full_url)
        return _FakeResponse(fake_urlopen.body)

    fake_urlopen.body = _payload([])
    monkeypatch.setattr(sp_today.urllib.request, "urlopen", fake_urlopen)
    return fake_urlopen, calls


def test_reads_the_old_pound(source):
    serve, _ = source
    serve.body = _payload(
        [{"date": "2026-07-27T23:59:02+03:00", "buy": 13350, "sell": 13425}]
    )
    quote = fetch_history("today")[0]
    assert (quote.buy_rate, quote.sell_rate) == (13350.0, 13425.0)
    assert quote.mid_rate == 13387.5


def test_new_pound_values_are_refused(source):
    """If the endpoint ever switches to the redenominated pound, fail loudly."""
    serve, _ = source
    serve.body = _payload(
        [{"date": "2026-07-27T23:59:02+03:00", "buy": 133.50, "sell": 134.25}]
    )
    with pytest.raises(ScrapeError, match="plausible old-pound band"):
        fetch_history("today")


def test_unknown_range_is_refused_before_the_request(source):
    """The source would answer 200 with ~1 month, which is worse than an error."""
    _, calls = source
    with pytest.raises(ScrapeError, match="unsupported range"):
        fetch_history("2y")
    assert calls == [], "must not reach the network with a range it cannot honour"


def test_every_supported_range_is_sent_verbatim(source):
    serve, calls = source
    serve.body = _payload(
        [{"date": "2026-07-27T23:59:02+03:00", "buy": 13350, "sell": 13425}]
    )
    for key in RANGES:
        fetch_history(key)
    for key, url in zip(RANGES, calls):
        assert f"range={key}" in url
        assert "code=USD" in url


def test_both_date_shapes_parse(source):
    serve, _ = source
    serve.body = _payload(
        [
            {"date": "2026-07-27T23:59:02+03:00", "buy": 13350, "sell": 13425},
            {"date": "2026-07-28 00:02:03", "buy": 13300, "sell": 13375},
        ]
    )
    assert [q.rate_date for q in fetch_history("today")] == [
        date(2026, 7, 27),
        date(2026, 7, 28),
    ]


def test_last_point_of_a_day_wins(source):
    """Intraday updates collapse to the day's closing rate."""
    serve, _ = source
    serve.body = _payload(
        [
            {"date": "2026-07-28 00:02:03", "buy": 13300, "sell": 13375},
            {"date": "2026-07-28T14:11:29+03:00", "buy": 13350, "sell": 13425},
        ]
    )
    quotes = fetch_history("today")
    assert len(quotes) == 1
    assert quotes[0].buy_rate == 13350.0


def test_results_are_sorted_oldest_first(source):
    serve, _ = source
    serve.body = _payload(
        [
            {"date": "2026-07-27T23:59:02+03:00", "buy": 13350, "sell": 13425},
            {"date": "2026-06-28T23:59:02+03:00", "buy": 12850, "sell": 12950},
        ]
    )
    quotes = fetch_history("1m")
    assert [q.rate_date for q in quotes] == [date(2026, 6, 28), date(2026, 7, 27)]


def test_html_instead_of_json_raises(source):
    """A Cloudflare interstitial answers 200 with a page, not an error."""
    serve, _ = source
    serve.body = b"<html><body>Just a moment...</body></html>"
    with pytest.raises(ScrapeError, match="did not return JSON"):
        fetch_history("1m")


def test_empty_history_raises(source):
    serve, _ = source
    serve.body = _payload([])
    with pytest.raises(ScrapeError, match="no history"):
        fetch_history("1y")


def test_unreadable_point_raises_rather_than_skipping(source):
    serve, _ = source
    serve.body = _payload([{"date": "2026-07-27T23:59:02+03:00", "buy": None, "sell": 13425}])
    with pytest.raises(ScrapeError, match="unreadable buy/sell"):
        fetch_history("today")


def test_fetch_today_takes_the_most_recent_point(source):
    serve, _ = source
    serve.body = _payload(
        [
            {"date": "2026-07-28 00:02:03", "buy": 13300, "sell": 13375},
            {"date": "2026-07-28T14:11:29+03:00", "buy": 13350, "sell": 13425},
        ]
    )
    assert sp_today.fetch_today().buy_rate == 13350.0
