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
import re
from datetime import datetime
from enum import Enum
from enum import Enum
from typing import Annotated, List, Literal, Optional, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Discriminator,
    Field,
    Tag,
    field_validator,
    model_validator,
)

from app.dto._boolean_tree import measure, node_tag
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


# the Arabic keyboard's natural comma; both separate IS_IN values because an
# AR-mode dispatcher will type the one their layout produces
_COMMA_SPLIT = re.compile(r"[,،]")


def canonical_tag_value(value: str) -> str:
    """Converge a typed tag-filter value the way customer tags are converged
    on write (dto/customer.normalize_tags): visible catalog-label spellings —
    the bilingual label, its Arabic half, a colon-spaced twin — all map to the
    canonical machine tag. Without this an AR-mode dispatcher who retypes the
    chip text saves a filter that can never match any stored tag."""
    from app.dto.customer import _PREDEFINED_ALIASES

    tag = str(value).strip()
    tag = _PREDEFINED_ALIASES.get(tag, tag)
    if tag.count(":") == 1:
        key, val = (part.strip() for part in tag.split(":"))
        if key and val:
            tag = _PREDEFINED_ALIASES.get(f"{key}:{val}", f"{key}:{val}")
    return tag


def _clean_values(op: str, value) -> Union[str, List[str]]:
    """IS_IN takes a non-empty list of non-blank strings; every other op takes
    one non-blank string. Blank entries are a builder bug surfaced early."""
    if op == "IS_IN":
        if isinstance(value, str):
            # tolerate a comma-separated string from a plain text input;
            # commas are forbidden inside tags/categories so the split is safe
            value = [v for v in (p.strip() for p in _COMMA_SPLIT.split(value)) if v]
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
        cleaned = _clean_values(self.op.value, self.value)
        # whole-tag ops converge catalog-label spellings to machine tags;
        # CONTAINS is a substring so only an exact alias hit converges
        if isinstance(cleaned, list):
            cleaned = [canonical_tag_value(v) for v in cleaned]
        else:
            cleaned = canonical_tag_value(cleaned)
        self.value = cleaned
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


# Bounds on ONE priority's tag expression. Halved from the customer query's
# 20/12 because this is a single field with four operators, not seven fields.
# No config-wide cap: 10 priorities x 10 leaves is 100 string-membership tests
# per customer over a pool the router has already narrowed, which is noise
# beside the KMeans fit in the same loop.
MAX_TAG_DEPTH = 3      # root group + 2 nested levels
MAX_TAG_LEAVES = 10    # tag filters in one priority's whole tree
MAX_TAG_CHILDREN = 8   # per group
MAX_TAG_NODES = 32


class TagConnector(str, Enum):
    AND = "AND"
    OR = "OR"


class TagGroup(BaseModel):
    """A parenthesised sub-expression over tags: `op` joins THIS group's children."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["group"] = "group"
    op: TagConnector = TagConnector.AND
    children: List["TagNode"] = Field(..., min_length=1, max_length=MAX_TAG_CHILDREN)


# TagFilter deliberately gains NO `kind` field. QueryRow declares one because
# it is never persisted; a tag filter IS persisted inside routing_strategy.config,
# and adding a key would rewrite every future dump of every stored strategy.
# node_tag discriminates on the presence of `children` instead.
TagNode = Annotated[
    Union[Annotated[TagGroup, Tag("group")], Annotated[TagFilter, Tag("row")]],
    Discriminator(node_tag),
]
TagGroup.model_rebuild()


class StrategyPriority(BaseModel):
    """One band of a routing strategy. Every filter on it must hold (AND).

    The tag constraint may be either shape, never both:
      * tag_filters    — LEGACY and permanent, an n-way AND. Every config
        stored before grouping existed carries this literal key, so removing
        it would turn extra="forbid" into a ValidationError on every stored
        strategy the moment the route step re-validates one.
      * tag_expression — the grouped form, for anything with an OR in it.
    Neither present means no tag constraint at all, which is a legitimate
    catch-all band and the state of most stored strategies.

    The two are reconciled at EVALUATION time, not here — see
    priority_router.tag_expression_of. This model must not rewrite what it was
    given: its dump goes straight into a JSON column, so a validator that
    derived one field from the other would persist both and then refuse the
    row it just wrote.
    """

    model_config = ConfigDict(extra="forbid")

    tag_filters: List[TagFilter] = Field(default_factory=list)
    tag_expression: Optional[TagGroup] = None
    category_filter: Optional[CategoryFilter] = None
    debt_filter: Optional[DebtFilter] = None
    # skip customers effectively visited more recently than this many days ago
    # (never-visited customers always pass)
    last_effective_stop_days: Optional[int] = Field(None, ge=0, le=3650)
    # cap on how many stops THIS priority may contribute; the remaining
    # desired_stops budget always caps it too
    max_stops: Optional[int] = Field(None, ge=1, le=200)

    @model_validator(mode="after")
    def one_tag_shape(self):
        if self.tag_filters and self.tag_expression is not None:
            raise ValueError(
                "send either `tag_filters` (legacy) or `tag_expression`, not both"
            )
        if self.tag_expression is not None:
            depth, leaves, nodes = measure(self.tag_expression)
            if depth > MAX_TAG_DEPTH:
                raise ValueError(
                    f"tag groups may nest {MAX_TAG_DEPTH - 1} levels below the "
                    f"outermost one; this nests {depth - 1}"
                )
            if leaves > MAX_TAG_LEAVES:
                raise ValueError(
                    f"a priority may hold at most {MAX_TAG_LEAVES} tag filters; "
                    f"this has {leaves}"
                )
            if nodes > MAX_TAG_NODES:
                raise ValueError("tag expression is too large")
        return self


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
    if "," in name or "،" in name:
        # names travel through comma-joined option lists in places; keep them
        # out to avoid ever splitting a name in half
        raise ValueError("name must not contain commas")
    if name.startswith("_"):
        # underscore-prefixed values are reserved for UI sentinels (the web
        # dropdown's "__create_strategy__" row must never collide with a name)
        raise ValueError("name must not start with an underscore")
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
