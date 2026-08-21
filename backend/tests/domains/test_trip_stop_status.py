"""A worked stop must stop reading as in flight.

trip_stop.status was set IN_PROGRESS at creation and advanced by nothing, so
every stop ever worked still looked live. The distribution query excludes any
customer holding a planned/in_progress stop, which made a customer permanently
unroutable the first time they appeared on a trip, and its "don't revisit within
N days" rule keyed on status='completed', which almost never happened.

What this file pins is the classification, in both the places it exists: the
Python the operator runs, and the SQL that repaired the rows already stranded.
They are the same rule written twice, and a drift between them is silent — old
rows would just mean something different from new ones.

The distinction that is easy to get wrong, and so has its own cases: a BLANK
outcome is `completed`, not `skipped`. The outcome column is an unvalidated
string so a completion can carry '', and the rep still worked that stop.
Calling it skipped would leave the customer eligible for an immediate revisit,
which is the opposite of what happened.
"""
import pytest

from app.domains.task_execution.workflow_operators.trip_stop_operator import (
    status_for_outcome,
)
from app.domains.task_execution.workflow_operators.create_trip_operator import (
    TripStopOutcome,
)
from app.dto.trip_stop import TripStopStatus

COMPLETED = TripStopStatus.COMPLETED.value
SKIPPED = TripStopStatus.SKIPPED.value


def _sql_status(outcome) -> str:
    """The migration's CASE, re-implemented exactly:

        CASE WHEN split_part(btrim(split_part(outcome,' - ',1)),':',1) = 'skipped'
             THEN 'skipped' ELSE 'completed' END

    split_part(NULL, ...) is NULL, and NULL = 'skipped' is NULL, which CASE
    treats as not-matched — so a NULL outcome falls to 'completed', same as the
    Python.
    """
    machine = "" if outcome is None else outcome.split(" - ")[0].strip()
    return SKIPPED if machine.split(":")[0] == "skipped" else COMPLETED


EXPECTED = {
    TripStopOutcome.SALE: COMPLETED,
    TripStopOutcome.INTERESTED_HAVE_INVENTORY: COMPLETED,
    TripStopOutcome.INTERESTED_NEEDS_BETTER_PRICE: COMPLETED,
    TripStopOutcome.INTERESTED_INSUFFICIENT_FUNDS: COMPLETED,
    TripStopOutcome.INTERESTED_PRIORITIZE_NEXT_VISIT: COMPLETED,
    # a refusal is a worked stop: the rep got there and was told no
    TripStopOutcome.NOT_INTERESTED_COMPETITOR: COMPLETED,
    TripStopOutcome.NOT_INTERESTED_BAD_PRODUCT: COMPLETED,
    TripStopOutcome.NOT_INTERSTED_PRICE_TOO_HIGH: COMPLETED,
    TripStopOutcome.NOT_INTERESTED_OTHER: COMPLETED,
    TripStopOutcome.BLACKLIST: COMPLETED,
    TripStopOutcome.SKIPPED_CUSTOMER_NOT_AVAILABLE: SKIPPED,
    TripStopOutcome.SKIPPED_VEHICLE_BREAKDOWN: SKIPPED,
    TripStopOutcome.SKIPPED_NO_PARKING: SKIPPED,
    TripStopOutcome.SKIPPED_NO_TIME: SKIPPED,
    TripStopOutcome.SKIPPED_OTHER: SKIPPED,
}


def test_every_outcome_has_a_decided_status():
    assert set(EXPECTED) == set(TripStopOutcome), (
        "TripStopOutcome changed: decide whether the new option leaves the stop "
        "completed or skipped, and add it to EXPECTED"
    )


@pytest.mark.parametrize("outcome", list(TripStopOutcome), ids=lambda o: o.name)
def test_status_for_each_outcome(outcome):
    assert status_for_outcome(outcome.value) == EXPECTED[outcome]


LEGACY_AND_EDGE_SHAPES = [
    None,
    "",
    "   ",
    "sale",
    "skipped",
    "skipped:no_time",
    "  skipped:no_time - تم التخطي",
    "skipped:no_time - تم التخطي: لا يوجد وقت",
    "sale - تم البيع - إضافي",
    "Skipped:no_time - x",
    "negotiating:follow_up - نص",
]


@pytest.mark.parametrize(
    "outcome",
    [o.value for o in TripStopOutcome] + LEGACY_AND_EDGE_SHAPES,
    ids=lambda v: repr(v),
)
def test_python_and_repair_sql_agree(outcome):
    """The operator and the migration classify identically, or the rows repaired
    once mean something different from the rows written since."""
    assert status_for_outcome(outcome) == _sql_status(outcome)


@pytest.mark.parametrize("outcome", [None, "", "   "])
def test_a_blank_outcome_completes_the_stop(outcome):
    """Not skipped: the API accepts a blank outcome, and the rep still worked
    the stop. Calling it skipped would leave the customer eligible for an
    immediate revisit."""
    assert status_for_outcome(outcome) == COMPLETED


def test_a_bare_skipped_still_counts_as_skipped():
    """Legacy rows predate the key:value outcome shape."""
    assert status_for_outcome("skipped") == SKIPPED


def test_mixed_case_is_not_the_skipped_family():
    """The families are exact machine strings; nothing writes 'Skipped'. Pinned
    so the Python and the SQL agree on it rather than by accident."""
    assert status_for_outcome("Skipped:no_time - x") == COMPLETED


# --- cancelling a trip must not rewrite what the rep reported ---------------

def _cancel_trip_would_overwrite(stop_status: str) -> bool:
    """Run the REAL TripDomain.cancel_trip over a one-stop trip and report
    whether the stop's status was rewritten.

    This used to scrape the function's source for status literals, so it broke
    the moment the predicate was expressed as a shared constant while behaving
    identically. Exercising the function itself cannot drift from what ships.
    """
    from unittest.mock import MagicMock

    from app.domains.trip.domain import TripDomain
    from app.dto.trip import TripStatus

    stop = MagicMock()
    stop.status = stop_status
    trip = MagicMock()
    trip.status = TripStatus.IN_PROGRESS.value
    trip.stops = [stop]
    uow = MagicMock()
    uow.trip_repository.find_one.return_value = trip

    try:
        TripDomain.cancel_trip(uow=uow, uuid="t-1")
    except Exception:
        # the stop statuses are rewritten before cancel_trip builds its
        # TripRead, and TripRead cannot be built from a mock — the mutation is
        # what is under test here, so a DTO failure afterwards is irrelevant
        pass
    return stop.status != stop_status


@pytest.mark.parametrize("status", [COMPLETED, SKIPPED])
def test_cancelling_a_trip_preserves_a_worked_stop(status):
    """Both are stops the rep actually worked. SKIPPED was missing from the
    exempt list — harmless while nothing wrote it, live the moment a skipped:*
    outcome does, and it would erase a recorded skip."""
    assert not _cancel_trip_would_overwrite(status)


@pytest.mark.parametrize("status", [TripStopStatus.PLANNED.value, TripStopStatus.IN_PROGRESS.value])
def test_cancelling_a_trip_still_cancels_unworked_stops(status):
    assert _cancel_trip_would_overwrite(status)


def test_an_unknown_family_completes_the_stop():
    """A future outcome describing something that happened leaves the stop
    worked — only an explicit skip means the stop was passed over."""
    assert status_for_outcome("negotiating:follow_up - نص") == COMPLETED
