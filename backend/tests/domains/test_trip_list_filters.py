"""The trip list's assignee / vehicle filters (app/domains/trip/list_filters.py).

The queries themselves were checked live against the local database (every
option matches exactly the trips that display it). These pin the parts a
refactor could quietly break: the SQL shape of the assignee condition -- both
identifiers, the start_trip operator, the tenant correlation -- an unknown
assignee matching nothing rather than everything, and the option labels.
"""
import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.domains.trip.list_filters import (
    START_TRIP_OPERATOR,
    assigned_to_clause,
    display_name,
)
from app.dto.trip import TripFilterOptions, TripListParams


class _User:
    def __init__(self, uuid, username):
        self.uuid = uuid
        self.username = username


def _sql(clause):
    return str(
        clause.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )


def test_unknown_assignee_matches_no_trip():
    # a filter that named nobody must not be dropped (that would list every trip)
    assert _sql(assigned_to_clause(None)) == "false"


def test_assignee_condition_matches_either_stored_identifier():
    sql = _sql(assigned_to_clause(_User("u-123", "laila")))
    assert sql.startswith("EXISTS")
    # the setup stores a uuid (web) or a username (app): both must match
    assert "'u-123'" in sql and "'laila'" in sql
    assert "assigned_user_uuid" in sql
    assert f"'{START_TRIP_OPERATOR}'" in sql


def test_assignee_condition_is_correlated_to_the_trip_and_its_tenant():
    from sqlalchemy import select
    from models.common import Trip

    # as the list route uses it: inside a query over trip
    sql = _sql(select(Trip.uuid).where(assigned_to_clause(_User("u-1", "x"))))
    assert "task_execution.workflow_execution_uuid = trip.workflow_execution_uuid" in sql
    assert "task_execution.account_uuid = trip.account_uuid" in sql
    # correlated to the outer trip, not a cross join with a second copy of it
    inner = sql.split("EXISTS", 1)[1]
    inner_from = inner.split("FROM", 1)[1].split("WHERE", 1)[0]
    assert "task_execution JOIN task ON" in inner_from
    assert "trip" not in inner_from.replace("task_execution", "")


@pytest.mark.parametrize(
    "first, last, username, expected",
    [
        ("laila", "bardan", "laila", "laila bardan"),
        ("  Wael ", "", "wael", "Wael"),
        ("", "", "drv_test", "drv_test"),
        (None, None, "zaid", "zaid"),
        ("", "Khattab", "abuabdo", "Khattab"),
    ],
)
def test_display_name(first, last, username, expected):
    assert display_name(first, last, username) == expected


def test_list_params_take_an_assignee_and_still_refuse_unknown_params():
    assert TripListParams(assigned_user_uuid="laila").assigned_user_uuid == "laila"
    assert TripListParams().assigned_user_uuid is None
    with pytest.raises(ValidationError):
        TripListParams(assigned_to="laila")


def test_filter_options_shape():
    dto = TripFilterOptions(
        assignees=[{"uuid": "u-1", "username": "laila", "name": "laila bardan"}],
        vehicles=[{"uuid": "v-1", "plate_number": "AB-123"}],
    )
    assert dto.model_dump(mode="json") == {
        "assignees": [{"uuid": "u-1", "username": "laila", "name": "laila bardan"}],
        "vehicles": [{"uuid": "v-1", "plate_number": "AB-123"}],
    }
