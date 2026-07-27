"""Read USD→SYP market rates off sp-today.com.

sp-today is the reference for the *market* rate in Syria, which is the rate this
business actually trades at — not the official CBS rate that generic FX APIs
return. There is a documented API but it needs a paid key, so we parse the
public page. It is server-rendered (Next.js flight payload), so a plain GET is
enough; no browser, no JS.

THE ONE THING TO GET RIGHT — old vs new pound
---------------------------------------------
Syria redenominated the pound (two zeros removed). The page headline now quotes
the NEW pound (1 USD = 133.50 SYP) and gives the OLD in parentheses
(13,350 old). Every SYP amount already in this database is in OLD pounds, so
that is what we store; storing 133.50 where 13,350 belongs would silently
misprice every conversion by 100x.

`MIN_PLAUSIBLE_RATE` is the guard: a new-pound number cannot pass it. If the
site ever drops the old-pound figure, parsing fails loudly instead of writing a
number that is wrong by two orders of magnitude.
"""
from __future__ import annotations

import http.client
import re
import urllib.error
import urllib.request
from datetime import date, datetime
from typing import NamedTuple

URL = "https://sp-today.com/en/currency/us-dollar"
# identifies us honestly; the site serves the same HTML to any UA
USER_AGENT = "Mozilla/5.0 (compatible; karma-erp/1.0; +https://karma-grp.com)"
TIMEOUT_SECONDS = 20

# Old-pound USD/SYP has been in the thousands for years. The band exists to
# reject a new-pound value (~134) or a stray number scraped from elsewhere on
# the page, not to predict the market.
MIN_PLAUSIBLE_RATE = 1_000.0
MAX_PLAUSIBLE_RATE = 1_000_000.0

# "...is 133.50 new SYP (13,350 old) for buying and 134.25 new SYP (13,425 old)
# for selling." We take the OLD figures.
_HEADLINE_RE = re.compile(
    r"is\s+[\d,.]+\s+new SYP\s+\(([\d,]+)\s+old\)\s+for buying"
    r"\s+and\s+[\d,.]+\s+new SYP\s+\(([\d,]+)\s+old\)\s+for selling",
    re.I,
)

# Daily series embedded in the flight payload, quoted in OLD pounds:
#   {\"date\":\"2026-06-27T23:59:02+03:00\",\"timestamp\":...,\"buy\":12950,\"sell\":13050}
# Anchored on the date key on purpose: an unanchored buy/sell match also picks
# up the per-city blocks further down the page (103 matches instead of 26).
_SERIES_RE = re.compile(
    r'\{\\"date\\":\\"(\d{4}-\d{2}-\d{2})[^"]*\\",'
    r'\\"timestamp\\":\d+,'
    r'\\"buy\\":([\d.]+),'
    r'\\"sell\\":([\d.]+)\}'
)


class ScrapeError(RuntimeError):
    """The page loaded but did not contain what we need."""


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
        """
        return round((self.buy_rate + self.sell_rate) / 2, 2)


def _check(value: float, label: str) -> float:
    if not (MIN_PLAUSIBLE_RATE <= value <= MAX_PLAUSIBLE_RATE):
        raise ScrapeError(
            f"{label} {value} is outside the plausible old-pound band "
            f"[{MIN_PLAUSIBLE_RATE:,.0f}, {MAX_PLAUSIBLE_RATE:,.0f}] — the page "
            f"format likely changed (new-pound value?). Refusing to store it."
        )
    return value


def fetch_page(url: str = URL) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise ScrapeError(f"sp-today returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as exc:
        # http.client.HTTPException covers IncompleteRead / BadStatusLine, which
        # are NOT OSError subclasses and are raised by read() below urllib's
        # wrapper — without it a truncated body escapes as a 500
        raise ScrapeError(f"could not reach sp-today: {exc}") from exc


def parse_today(html: str, today: date | None = None) -> Quote:
    """Today's buy/sell from the page headline, in old pounds."""
    match = _HEADLINE_RE.search(html)
    if not match:
        raise ScrapeError(
            "could not find the 'new SYP (… old) for buying/selling' sentence — "
            "the page layout changed"
        )
    buy = _check(float(match.group(1).replace(",", "")), "buy rate")
    sell = _check(float(match.group(2).replace(",", "")), "sell rate")
    return Quote(rate_date=today or date.today(), buy_rate=buy, sell_rate=sell)


def parse_series(html: str) -> list[Quote]:
    """The daily series the page embeds for its chart, oldest first.

    Roughly the last 30 days, with gaps on days the market did not move or the
    site did not record (weekends, holidays). One quote per date; if a date
    somehow repeats, the last occurrence wins.
    """
    by_date: dict[date, Quote] = {}
    for raw_date, raw_buy, raw_sell in _SERIES_RE.findall(html):
        try:
            day = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError:
            continue
        buy = _check(float(raw_buy), f"buy rate for {raw_date}")
        sell = _check(float(raw_sell), f"sell rate for {raw_date}")
        by_date[day] = Quote(rate_date=day, buy_rate=buy, sell_rate=sell)
    if not by_date:
        raise ScrapeError(
            "no daily series found in the page — the embedded chart data moved "
            "or changed shape"
        )
    return [by_date[d] for d in sorted(by_date)]


def fetch_today(url: str = URL) -> Quote:
    return parse_today(fetch_page(url))


def fetch_series(url: str = URL) -> list[Quote]:
    return parse_series(fetch_page(url))
