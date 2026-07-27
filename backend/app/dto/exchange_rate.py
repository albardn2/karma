from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import List, Optional
from datetime import date, datetime

from app.dto.common_enums import Currency


class ExchangeRateSource(str, Enum):
    SP_TODAY = "sp-today"
    MANUAL = "manual"


class BackfillRange(str, Enum):
    """How far back to pull. Mirrors the ranges sp-today's chart offers.

    An enum rather than a free string on purpose: the source answers 200 with
    about a month for any value it does not recognise, so an unvalidated range
    would look like a successful year-long backfill that quietly fetched 26 days.
    """
    TODAY = "today"
    ONE_WEEK = "1w"
    ONE_MONTH = "1m"
    THREE_MONTHS = "3m"
    SIX_MONTHS = "6m"
    ONE_YEAR = "1y"


class ExchangeRateBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_currency: Currency
    to_currency: Currency
    # units of to_currency per 1 from_currency; SYP is the OLD pound
    rate: float = Field(gt=0)
    buy_rate: Optional[float] = Field(None, gt=0)
    sell_rate: Optional[float] = Field(None, gt=0)
    rate_date: date
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _distinct_currencies(self):
        # a self-rate is always 1 and would give the transaction form a
        # meaningless default to pre-fill
        if self.from_currency == self.to_currency:
            raise ValueError("from_currency and to_currency must differ")
        return self


class ExchangeRateCreate(ExchangeRateBase):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    source: ExchangeRateSource = ExchangeRateSource.MANUAL


class ExchangeRateUpdate(BaseModel):
    """Partial update. The pair and its date identify the row, so neither moves."""
    model_config = ConfigDict(extra="forbid")

    rate: Optional[float] = Field(None, gt=0)
    buy_rate: Optional[float] = Field(None, gt=0)
    sell_rate: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None


class ExchangeRateRead(ExchangeRateBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    source: str
    is_deleted: bool


class ExchangeRateListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    from_currency: Optional[Currency] = None
    to_currency: Optional[Currency] = None
    source: Optional[ExchangeRateSource] = None
    start: Optional[date] = None
    end: Optional[date] = None
    # bounded: page=0 would compute a negative OFFSET and Postgres rejects it
    # with a 500, and an unbounded per_page lets one request ask for everything
    page: int = Field(1, gt=0)
    per_page: int = Field(50, gt=0, le=100)


class ExchangeRatePage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exchange_rates: List[ExchangeRateRead]
    total_count: int
    page: int
    per_page: int
    pages: int


class ExchangeRatePullParams(BaseModel):
    """Body for /pull and /backfill.

    Parsing through a DTO rather than by hand so a bad currency or a
    non-ISO date answers 422 with the offending field, instead of a bare
    ValueError escaping as a 500 (nothing maps ValueError to a 4xx).
    """
    model_config = ConfigDict(extra="forbid")

    from_currency: Currency = Currency.USD
    to_currency: Currency = Currency.SYP
    # how far back to ask the source for; start/end still clip what comes back
    range: BackfillRange = BackfillRange.ONE_MONTH
    start: Optional[date] = None
    end: Optional[date] = None


class ExchangeRateLatestParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_currency: Currency = Currency.USD
    to_currency: Currency = Currency.SYP


class ExchangeRatePullResult(BaseModel):
    """What a pull/backfill actually changed, so the UI can say so precisely."""
    model_config = ConfigDict(extra="forbid")

    created: int
    updated: int
    from_currency: Currency
    to_currency: Currency
    source: str
    range: Optional[BackfillRange] = None
    first_date: Optional[date] = None
    last_date: Optional[date] = None
    exchange_rates: List[ExchangeRateRead]
