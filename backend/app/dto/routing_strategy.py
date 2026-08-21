"""Saved priority-routing strategies (2026-08 distribution revamp).

A strategy is an ORDERED list of priorities. The router walks them top to
bottom: each priority's filters select candidate customers, the spatially
tightest group of them (capped at the priority's max_stops and at what's left
of the trip's desired_stops) is picked, and the walk stops once desired_stops
is reached — fewer is fine. A priority with no filters at all is a legitimate
catch-all that matches every customer.

The config is stored as JSONB on the routing_strategy row and validated by
RoutingStrategyConfig both at save time and again when the route step runs
(the row is data — a hand-edited or stale shape must fail loudly, not route
garbage).
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.dto.common_enums import Currency


class TagFilterOp(str, Enum):
    EQUAL = "EQUAL"
    NOT_EQUAL = "NOT_EQUAL"
    IS_IN = "IS_IN"
    CONTAINS = "CONTAINS"


class CategoryFilterOp(str, Enum):
    EQUAL = "EQUAL"
    NOT_EQUAL = "NOT_EQUAL"
    IS_IN = "IS_IN"


class DebtFilterOp(str, Enum):
    LARGER_THAN = "LARGER_THAN"
    SMALLER_THAN = "SMALLER_THAN"


def _clean_values(op: str, value) -> Union[str, List[str]]:
    """IS_IN takes a non-empty list of non-blank strings; every other op takes
    one non-blank string. Blank entries are a builder bug surfaced early."""
    if op == "IS_IN":
        if isinstance(value, str):
            # tolerate a comma-separated string from a plain text input;
            # commas are forbidden inside tags/categories so the split is safe
            value = [v for v in (p.strip() for p in value.split(",")) if v]
        if not isinstance(value, list):
            raise ValueError("IS_IN requires a list of values")
        cleaned = [str(v).strip() for v in value if str(v).strip()]
        if not cleaned:
            raise ValueError("IS_IN requires at least one non-blank value")
        return cleaned
    if isinstance(value, list):
        raise ValueError(f"{op} takes a single value, not a list")
    cleaned = str(value).strip()
    if not cleaned:
        raise ValueError(f"{op} requires a non-blank value")
    return cleaned


class TagFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: TagFilterOp
    value: Union[str, List[str]]

    @model_validator(mode="after")
    def value_shape_matches_op(self):
        self.value = _clean_values(self.op.value, self.value)
        return self


class CategoryFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: CategoryFilterOp
    value: Union[str, List[str]]

    @model_validator(mode="after")
    def value_shape_matches_op(self):
        self.value = _clean_values(self.op.value, self.value)
        return self


class DebtFilter(BaseModel):
    """Outstanding balance in ONE currency (USD and SYP debts are separate
    numbers that must not be mixed — see Customer.balance_per_currency)."""
    model_config = ConfigDict(extra="forbid")

    op: DebtFilterOp
    amount: float
    currency: Currency = Currency.SYP


class StrategyPriority(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # every tag filter must hold (AND) for a customer to match
    tag_filters: List[TagFilter] = Field(default_factory=list)
    category_filter: Optional[CategoryFilter] = None
    debt_filter: Optional[DebtFilter] = None
    # skip customers effectively visited more recently than this many days ago
    # (never-visited customers always pass)
    last_effective_stop_days: Optional[int] = Field(None, ge=0, le=3650)
    # cap on how many stops THIS priority may contribute; the remaining
    # desired_stops budget always caps it too
    max_stops: Optional[int] = Field(None, ge=1, le=200)


class RoutingStrategyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    priorities: List[StrategyPriority] = Field(min_length=1, max_length=10)


# names the setup form's strategy dropdown owns; a saved strategy must not
# shadow them (trip_setup.FORM_STRATEGIES + the legacy bridge value)
RESERVED_STRATEGY_NAMES = {"manual", "legacy_cluster"}
MAX_STRATEGY_NAME_LENGTH = 64


def _clean_name(v: str) -> str:
    name = str(v).strip()
    if not name:
        raise ValueError("name must not be blank")
    if len(name) > MAX_STRATEGY_NAME_LENGTH:
        raise ValueError(f"name must be at most {MAX_STRATEGY_NAME_LENGTH} characters")
    if name.lower() in RESERVED_STRATEGY_NAMES:
        raise ValueError(f"'{name}' is a built-in strategy name")
    if "," in name:
        # names travel through comma-joined option lists in places; keep them
        # out to avoid ever splitting a name in half
        raise ValueError("name must not contain commas")
    return name


class RoutingStrategyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    config: RoutingStrategyConfig
    created_by_uuid: Optional[str] = None

    @field_validator("name")
    def name_is_clean(cls, v):
        return _clean_name(v)


class RoutingStrategyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    config: Optional[RoutingStrategyConfig] = None

    @field_validator("name")
    def name_is_clean(cls, v):
        if v is None:
            return v
        return _clean_name(v)


class RoutingStrategyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    name: str
    config: dict
    created_by_uuid: Optional[str] = None
    created_at: datetime
    is_deleted: bool = False


class RoutingStrategyListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    name: Optional[str] = None

    page: int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")


class RoutingStrategyPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    routing_strategies: List[RoutingStrategyRead] = Field(...)
    total_count: int = Field(...)
    page: int = Field(...)
    per_page: int = Field(...)
    pages: int = Field(...)
