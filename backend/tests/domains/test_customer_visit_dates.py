"""The two definitions of "reached the customer" must stay one definition.

customer.last_effective_stop is written from two places: Python, on every stop
completion (auto_tags.is_effective_outcome, via visit_dates.recompute_visit_dates),
and SQL, once, in the migration that backfilled the column. They express the
same rule in two languages, and a drift between them is invisible — the column
just quietly means something different for old rows than for new ones.

So this file re-implements the SQL predicate in Python, term for term, and
asserts it agrees with the real function over every outcome value and every
legacy shape the column is known to hold. The SQL is not paraphrased from
memory: it is extracted from the shipped query text, so editing the query
without editing the mirror fails here.

What it cannot do is run Postgres, which the domain test suite has no fixture
for. The split_part/btrim semantics were verified against the real database by
hand; what is pinned here is that the two RULES agree, which is the part a
future edit is actually likely to break.
"""
import re

import pytest

from app.domains.customer.auto_tags import is_effective_outcome
from app.domains.customer.visit_dates import _VISIT_DATES
from app.domains.task_execution.workflow_operators.create_trip_operator import (
    TripStopOutcome,
)


def _sql_effective(outcome) -> bool:
    """Postgres' answer, re-implemented exactly.

      btrim(split_part(outcome, ' - ', 1)) <> ''
      AND split_part(btrim(split_part(outcome, ' - ', 1)), ':', 1) <> 'skipped'

    split_part(NULL, ...) is NULL and every comparison against NULL is NULL,
    which a FILTER treats as false — hence the None short-circuit.
    """
    if outcome is None:
        return False
    machine = outcome.split(" - ")[0].strip()   # split_part(..., 1) + btrim
    if machine == "":
        return False
    return machine.split(":")[0] != "skipped"


# Every outcome that exists, plus the shapes the column is known to hold from
# before it was an enum, plus the ones a hand-written API call can still store.
LEGACY_AND_EDGE_SHAPES = [
    None,
    "",
    "   ",
    "sale",                                   # bare key, no Arabic half
    "skipped",                                # bare skipped, no subkey
    "skipped:no_time",                        # machine only
    "  skipped:no_time - تم التخطي",           # leading whitespace
    "skipped:no_time - تم التخطي: لا يوجد وقت",  # ':' inside the Arabic half
    "sale - تم البيع - إضافي",                  # a second ' - ' separator
    "Skipped:no_time - x",                    # mixed case: NOT the skipped family
    "negotiating:follow_up - نص",              # a family nobody has defined yet
    "no_sale",                                # a removed enum member
]


@pytest.mark.parametrize(
    "outcome",
    [o.value for o in TripStopOutcome] + LEGACY_AND_EDGE_SHAPES,
    ids=lambda v: repr(v),
)
def test_sql_and_python_agree_on_effectiveness(outcome):
    assert _sql_effective(outcome) == is_effective_outcome(outcome)


def test_the_mirror_is_taken_from_the_shipped_query():
    """If the query stops containing the predicate this file mirrors, the
    agreement above is being checked against something that no longer runs."""
    sql = " ".join(str(_VISIT_DATES).split())
    assert "btrim(split_part(ts.outcome, ' - ', 1)) <> ''" in sql
    assert "split_part(btrim(split_part(ts.outcome, ' - ', 1)), ':', 1) <> 'skipped'" in sql


def test_a_completed_stop_counts_even_with_a_blank_outcome():
    """The API never validates the outcome string, so a completion can carry ''.
    The stop still happened: it is the task execution reaching `completed` that
    makes it a visit, which is why the query does not require an outcome."""
    sql = " ".join(str(_VISIT_DATES).split())
    assert "te.status = 'completed' OR btrim(COALESCE(ts.outcome, '')) <> ''" in sql
    # ...and such a stop is still not EFFECTIVE, on both sides
    assert is_effective_outcome("") is False
    assert _sql_effective("") is False


def test_the_query_is_scoped_to_one_customer():
    """It is executed with a bound customer_uuid resolved through the scoped
    repository; a missing filter would silently aggregate across tenants."""
    sql = " ".join(str(_VISIT_DATES).split())
    assert "ts.customer_uuid = :customer_uuid" in sql
    assert len(re.findall(r":customer_uuid", sql)) == 1
