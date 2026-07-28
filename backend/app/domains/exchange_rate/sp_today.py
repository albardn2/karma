"""Read USD→SYP market rates from sp-today.com.

sp-today is the reference for the *market* rate in Syria, which is the rate this
business actually trades at — not the official CBS rate that generic FX APIs
return.

We use the same JSON endpoint the site's own price-history chart calls:

    GET /api/historical?code=USD&city=damascus&range=1y
    -> [{"date": "2025-07-28T20:00:01+03:00", "timestamp": ..., "buy": 10300, "sell": 10300}, ...]

Unauthenticated, and it goes back a year (299 daily points) or to 2015 with
range=all. An earlier version of this module scraped the rendered page instead
and could only see the ~26 points the HTML embeds as `initialChartData`, which
is just the chart's opening view.

THE ONE THING TO GET RIGHT — old vs new pound
---------------------------------------------
Syria redenominated the pound (two zeros removed). This database keeps its books
in the NEW pound (1 USD ~ 133.50 SYP), but **this endpoint still returns the OLD
pound** (13,350), so every value is divided by `OLD_PER_NEW` on the way in.

`PLAUSIBLE_RATE` brackets the converted figure, which catches a mistake in
either direction: forget the division and 13,350 is far above the ceiling; apply
it twice, or have the endpoint start quoting new pounds itself, and 1.34 is far
below the floor. Either way the pull fails loudly instead of mispricing every
conversion by 100x.

A RANGE MUST NEVER BE PASSED THROUGH FROM A CALLER
--------------------------------------------------
An unrecognised range does not error — the endpoint quietly returns about a
month. `range=2y` and `range=5y` both come back with 26 points, not two or five
years. So only the values in `RANGES` may be sent; anything else would look like
a successful backfill that silently fetched a fraction of what was asked for.
"""
from __future__ import annotations

import http.client
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from typing import NamedTuple

API_URL = "https://sp-today.com/api/historical"
# identifies us honestly; the endpoint serves the same JSON to any UA
USER_AGENT = "Mozilla/5.0 (compatible; karma-erp/1.0; +https://karma-grp.com)"
TIMEOUT_SECONDS = 20

# The city the site's own chart requests. `city=general` and other city names
# answer 503, so this is the one that works; omitting it returns the same data,
# but being explicit means a change to the endpoint's default cannot move our
# numbers underneath us.
CITY = "damascus"

# What a caller may ask for, and roughly what each returns as of 2026-07-28.
# Capped at a year on purpose — `all` reaches 2015 but is aggregated (400 points
# for 11 years) and nobody asked for it.
RANGES = {
    "today": "today",   # ~2 intraday points for the current Damascus day
    "1w": "1w",         # ~6
    "1m": "1m",         # ~26
    "3m": "3m",         # ~77
    "6m": "6m",         # ~154
    "1y": "1y",         # ~299
}
DEFAULT_RANGE = "1m"

# The source publishes old pounds; we store new ones.
OLD_PER_NEW = 100

# Bounds on the CONVERTED (new-pound) rate. USD/SYP has been in the low
# hundreds since the redenomination, so this is wide enough for real market
# moves and narrow enough to catch a units mistake of 100x in either direction.
# NOTE: calibrated for USD. Turkish lira trades near 2.80 new pounds, below this
# floor — fine while USD is the only pullable pair, but revisit before adding one.
MIN_PLAUSIBLE_RATE = 10.0
MAX_PLAUSIBLE_RATE = 10_000.0


class ScrapeError(RuntimeError):
    """The source answered but not with data we can trust."""


class Quote(NamedTuple):
    rate_date: date
    buy_rate: float
    sell_rate: float

    @property
    def mid_rate(self) -> float:
        """What we store as the headline `rate`.

        Neither side of a real trade: buy is what an exchange office pays for
        your dollars, sell is what it charges. Bookkeeping uses the midpoint,
        and the transaction form leaves it editable.

        Four decimals, not two: in new pounds a rate is ~133.875 and it
        multiplies amounts, so trimming it to 133.88 would shift a large
        conversion by more than a pound.
        """
        return round((self.buy_rate + self.sell_rate) / 2, 4)


def _to_new_pound(raw: float, label: str) -> float:
    """Convert an old-pound figure from the source and sanity-check the result."""
    value = raw / OLD_PER_NEW
    if not (MIN_PLAUSIBLE_RATE <= value <= MAX_PLAUSIBLE_RATE):
        raise ScrapeError(
            f"{label} {raw} converts to {value} new pounds, outside the plausible "
            f"band [{MIN_PLAUSIBLE_RATE:,.0f}, {MAX_PLAUSIBLE_RATE:,.0f}] — the "
            f"source's units may have changed. Refusing to store it."
        )
    return value


def _parse_day(raw: str) -> date:
    """The calendar day of a timestamp, as Damascus reports it.

    Two shapes come back from the same endpoint — "2026-07-27T23:59:02+03:00"
    and "2026-07-28 00:02:03" — so take the leading date rather than parsing the
    whole thing. The offset is Damascus local, which is the right calendar day
    for a Syrian business, so there is nothing to convert.
    """
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError) as exc:
        raise ScrapeError(f"unparseable date {raw!r} from sp-today") from exc


def fetch_history(range_key: str = DEFAULT_RANGE, code: str = "USD") -> list[Quote]:
    """Daily quotes for a range, oldest first, one per day.

    Days the market did not move or the site did not record are simply absent.
    Where a day has several intraday points, the last one wins — that is the
    closing rate for the day.
    """
    if range_key not in RANGES:
        # never forward an unknown range: the endpoint would answer 200 with
        # about a month of data and the caller would believe it got what it asked
        raise ScrapeError(
            f"unsupported range {range_key!r}; expected one of {', '.join(RANGES)}"
        )

    query = urllib.parse.urlencode(
        {"code": code, "city": CITY, "range": RANGES[range_key]}
    )
    request = urllib.request.Request(
        f"{API_URL}?{query}", headers={"User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise ScrapeError(f"sp-today returned HTTP {exc.code}") from exc
    except (
        urllib.error.URLError,
        TimeoutError,
        OSError,
        # IncompleteRead / BadStatusLine are not OSError subclasses and are
        # raised by read() below urllib's wrapper
        http.client.HTTPException,
    ) as exc:
        raise ScrapeError(f"could not reach sp-today: {exc}") from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        # a Cloudflare interstitial answers 200 with HTML
        raise ScrapeError("sp-today did not return JSON") from exc

    if not isinstance(payload, list) or not payload:
        raise ScrapeError(
            f"sp-today returned no history for range {range_key!r} "
            f"(got {type(payload).__name__})"
        )

    by_date: dict[date, Quote] = {}
    for point in payload:
        if not isinstance(point, dict) or "date" not in point:
            raise ScrapeError(f"unexpected point shape from sp-today: {point!r}")
        try:
            buy = float(point["buy"])
            sell = float(point["sell"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ScrapeError(f"unreadable buy/sell in {point!r}") from exc
        day = _parse_day(point["date"])
        by_date[day] = Quote(
            rate_date=day,
            buy_rate=_to_new_pound(buy, f"buy rate for {day}"),
            sell_rate=_to_new_pound(sell, f"sell rate for {day}"),
        )

    return [by_date[d] for d in sorted(by_date)]


def fetch_today(code: str = "USD") -> Quote:
    """The current rate.

    Falls back to the last week when today has no points yet: the day rolls over
    in Damascus hours before the first quote of the morning is published.
    """
    quotes = fetch_history("today", code=code)
    if not quotes:
        quotes = fetch_history("1w", code=code)
    if not quotes:
        raise ScrapeError("sp-today published no recent rate")
    return quotes[-1]
