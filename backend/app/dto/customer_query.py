"""The customer map's query toolbar (2026-09).

A query is an ordered list of ROWS — field, operator, value — chained with
AND/OR connectors. AND binds tighter than OR, exactly like SQL: X AND Y OR Z
means (X AND Y) OR Z, so a dispatcher who thinks in SQL is never surprised.

Each field carries only the operators that mean something for it. The shapes
and the value cleaning are shared with the routing-strategy filters
(dto/routing_strategy) so the two builders cannot drift: the same typed tag
converges through the same catalog aliases, and IS_IN splits on the same two
commas (ASCII and Arabic) a dispatcher's keyboard may produce.
"""
from enum import Enum
from typing import List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

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
}


class QueryRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: QueryField
    op: str
    # every field except debt: one string, or a list for IS_IN
    value: Union[str, List[str], None] = None
    # debt only: the threshold and which pound it is counted in — USD and SYP
    # debts are separate numbers that must never be mixed
    amount: Optional[float] = None
    currency: Currency = Currency.SYP
    # binds this row to the PREVIOUS one; the first row has nothing to bind to
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


class CustomerQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: List[QueryRow] = Field(..., min_length=1, max_length=12)

    @model_validator(mode="after")
    def normalize_connectors(self):
        # the first row's connector is meaningless; a missing one later on
        # means AND, the least surprising default
        self.rows[0].connector = None
        for row in self.rows[1:]:
            if row.connector is None:
                row.connector = QueryConnector.AND
        return self
