"""The customer map's query toolbar (2026-09).

A query is a TREE of parenthesised groups: each group joins its children with a
single AND or OR, and a child is either a condition row or another group. That
makes ((X AND Y) OR (Y AND Z)) AND (A AND B) something a dispatcher writes
directly.

The flat shape this replaces could already express any such formula, because
consecutive ANDs intersected and ORs split groups — i.e. it evaluated a
disjunction of conjunctions, and every boolean formula has a DNF. What it could
not do is let anyone WRITE one: the example above had to be distributed by hand
into `X AND Y AND A AND B OR Y AND Z AND A AND B`, duplicating the shared
qualifier into every branch, burning rows against the cap, and taking the
duplicated (and most expensive) leaves with it. Grouping is about being able to
say it, not about reaching new result sets — worth knowing before anyone
"simplifies" this back.

The legacy flat `rows` is still accepted and is LOWERED into the same tree, so
the evaluator has exactly one path.

Each field carries only the operators that mean something for it. The shapes
and the value cleaning are shared with the routing-strategy filters
(dto/routing_strategy) so the two builders cannot drift: the same typed tag
converges through the same catalog aliases, and IS_IN splits on the same two
commas (ASCII and Arabic) a dispatcher's keyboard may produce.
"""
from enum import Enum
from typing import Annotated, List, Literal, Optional, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Discriminator,
    Field,
    Tag,
    model_validator,
)

from app.dto._boolean_tree import iter_leaves, measure, node_tag
from app.dto.common_enums import Currency
from app.dto.routing_strategy import _clean_values, canonical_tag_value


class QueryField(str, Enum):
    TAGS = "tags"
    DEBT = "debt"
    SERVICE_AREA = "service_area"
    # one field for both spellings of identity: matches full_name OR
    # company_name, because nobody remembers which of the two they typed
    NAME = "name"
    UUID = "uuid"
    CATEGORY = "category"
    # customer.last_effective_stop — the same column the routing strategies'
    # last_effective_stop_days reads, so the map previews who the router picks
    LAST_EFFECTIVE_VISIT = "last_effective_visit"


class QueryConnector(str, Enum):
    AND = "AND"
    OR = "OR"


OPS_BY_FIELD = {
    QueryField.TAGS: ("EQUAL", "NOT_EQUAL", "IS_IN"),
    QueryField.DEBT: ("LARGER_THAN", "SMALLER_THAN", "EQUAL"),
    QueryField.SERVICE_AREA: ("EQUAL", "NOT_EQUAL", "IS_IN"),
    QueryField.NAME: ("EQUAL", "NOT_EQUAL", "IS_IN", "CONTAINS"),
    QueryField.UUID: ("EQUAL", "NOT_EQUAL", "IS_IN"),
    QueryField.CATEGORY: ("EQUAL", "NOT_EQUAL", "IS_IN"),
    QueryField.LAST_EFFECTIVE_VISIT: (
        "OLDER_THAN_DAYS", "WITHIN_DAYS", "NEVER", "EVER",
    ),
}

# Bounds on the tree. MAX_CHILDREN alone does NOT bound it — 12 children at
# depth 3 is 1,728 leaves — so the leaf count is enforced globally.
MAX_DEPTH = 3       # root group + 2 nested levels; AND-of-ORs-of-ANDs is complete
MAX_LEAVES = 20     # conditions in the WHOLE tree
MAX_CHILDREN = 12   # per group
MAX_LEGACY_ROWS = 12  # the old flat contract, deliberately unchanged


class QueryRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["row"] = "row"
    field: QueryField
    op: str
    # every field except debt: one string, or a list for IS_IN
    value: Union[str, List[str], None] = None
    # debt only: the threshold, and the currency to convert the customer's
    # WHOLE debt INTO before comparing (every currency they owe is restated at
    # today's rate and summed — see domains/customer/query.converted_total_debt)
    amount: Optional[float] = None
    currency: Currency = Currency.SYP
    # last_effective_visit only, for the two windowed operators
    days: Optional[int] = Field(None, ge=1, le=3650)
    # LEGACY: binds this row to the PREVIOUS one in a flat `rows` list. Refused
    # inside a group, where the group's own `op` joins the children.
    connector: Optional[QueryConnector] = None

    @model_validator(mode="after")
    def op_matches_field_and_value_shape(self):
        allowed = OPS_BY_FIELD[self.field]
        op = str(self.op).strip().upper()
        if op not in allowed:
            raise ValueError(
                f"{self.field.value} supports {', '.join(allowed)} — not '{self.op}'"
            )
        self.op = op

        if self.days is not None and self.field != QueryField.LAST_EFFECTIVE_VISIT:
            raise ValueError(f"{self.field.value} rows take no `days`")

        if self.field == QueryField.LAST_EFFECTIVE_VISIT:
            if op in ("OLDER_THAN_DAYS", "WITHIN_DAYS"):
                if self.days is None:
                    raise ValueError(f"{op} needs a whole number of days")
            elif self.days is not None:
                # NEVER / EVER take no window; a stray days would read as though
                # it narrowed the match when it does nothing
                raise ValueError(f"{op} takes no `days`")
            self.value = None
            return self

        if self.field == QueryField.DEBT:
            # tolerate the amount arriving in `value` from a generic client
            if self.amount is None and self.value not in (None, "", []):
                try:
                    self.amount = float(self.value)  # type: ignore[arg-type]
                except (TypeError, ValueError):
                    raise ValueError("debt rows need a numeric amount")
            if self.amount is None:
                raise ValueError("debt rows need a numeric amount")
            self.value = None
            return self

        # `value` is Optional only so DEBT rows may omit it; on every other
        # field a missing value must refuse loudly — _clean_values would
        # otherwise stringify None into the perfectly matchable word "None"
        if self.value is None:
            raise ValueError(f"{self.field.value} rows need a value")
        # NOTE: a comma-separated IS_IN string is split on both commas, so a
        # NAME containing a comma cannot be expressed that way — API clients
        # should send IS_IN values as a JSON list, whose elements are kept
        # whole; single-value ops never split
        cleaned = _clean_values(op, self.value)
        if self.field == QueryField.TAGS:
            # converge catalog-label spellings to machine tags, like the
            # strategy builder does — a retyped Arabic chip must still match
            if isinstance(cleaned, list):
                cleaned = [canonical_tag_value(v) for v in cleaned]
            else:
                cleaned = canonical_tag_value(cleaned)
        self.value = cleaned
        return self


class QueryGroup(BaseModel):
    """A parenthesised sub-expression: `op` joins THIS group's children."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["group"] = "group"
    op: QueryConnector = QueryConnector.AND
    children: List["QueryNode"] = Field(..., min_length=1, max_length=MAX_CHILDREN)

    @model_validator(mode="after")
    def children_carry_no_connector(self):
        # extra="forbid" cannot catch this: `connector` is a DECLARED field and
        # has to stay declared for the legacy flat path. A half-migrated client
        # that pasted its old row objects in as children would otherwise have
        # its OR silently replaced by the group's op.
        for child in self.children:
            if isinstance(child, QueryRow) and child.connector is not None:
                raise ValueError(
                    "`connector` belongs to the legacy flat `rows` shape; inside "
                    "a group the group's own `op` joins the children"
                )
        return self


QueryNode = Annotated[
    Union[Annotated[QueryGroup, Tag("group")], Annotated[QueryRow, Tag("row")]],
    Discriminator(node_tag),
]
QueryGroup.model_rebuild()


class CustomerQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # LEGACY, lowered into `expression` below so the evaluator has one path: a
    # flat list chained with per-row connectors, AND binding tighter than OR.
    rows: Optional[List[QueryRow]] = Field(None, min_length=1, max_length=MAX_LEGACY_ROWS)
    expression: Optional[QueryGroup] = None
    # The map draws pins, so it evaluates over customers that HAVE a location;
    # the list has no such need, so it queries everyone. Default True keeps the
    # map (and any caller that omits it) on the location-bearing pool.
    require_coordinates: bool = True

    @model_validator(mode="after")
    def exactly_one_shape_then_lower(self):
        if self.rows is not None and self.expression is not None:
            raise ValueError("send either `rows` (legacy) or `expression`, not both")
        if self.rows is None and self.expression is None:
            raise ValueError("a query needs `expression` (or the legacy `rows`)")

        if self.rows is not None:
            self.expression = _lower_rows(self.rows)

        depth, leaves, nodes = measure(self.expression)
        if depth > MAX_DEPTH:
            raise ValueError(
                f"groups may nest {MAX_DEPTH - 1} levels below the outermost one; "
                f"this nests {depth - 1}"
            )
        if leaves > MAX_LEAVES:
            raise ValueError(f"a query may hold at most {MAX_LEAVES} conditions; this has {leaves}")
        if nodes > 64:
            raise ValueError("query is too large")
        return self


def _lower_rows(rows: List[QueryRow]) -> QueryGroup:
    """Flat rows -> the equivalent tree, preserving SQL precedence exactly.

    Consecutive ANDs intersect into a conjunction; an OR starts a new one; the
    conjunctions union. That is the shape the old evaluator computed, written
    out as parentheses.
    """
    groups: List[List[QueryRow]] = [[]]
    for i, row in enumerate(rows):
        connector = None if i == 0 else (row.connector or QueryConnector.AND)
        if connector == QueryConnector.OR:
            groups.append([])
        # the connector is a property of the FLAT list; a row inside a group
        # must not carry one, and QueryGroup refuses it
        groups[-1].append(row.model_copy(update={"connector": None}))

    def conjunction(members: List[QueryRow]):
        if len(members) == 1:
            return members[0]
        return QueryGroup(op=QueryConnector.AND, children=list(members))

    if len(groups) == 1:
        only = conjunction(groups[0])
        return only if isinstance(only, QueryGroup) else QueryGroup(
            op=QueryConnector.AND, children=[only]
        )
    return QueryGroup(op=QueryConnector.OR, children=[conjunction(g) for g in groups])
