"""A trip always ends up with a name, even when nobody types one.

The name is typed on the start-trip form and read back out of that task's stored
result by CreateTripOperator. Defaulting happens on the SERVER rather than in
either client, so the two agree and so a trip created by an API caller that never
rendered the form still gets a label.

The date is deliberately Damascus local (UTC+3), not UTC: the servers run UTC and
the business does not, so a trip started at 22:00 Damascus would otherwise be
named with the previous day's date — which is exactly the trip somebody would go
looking for the next morning.
"""
from datetime import datetime, timedelta

import pytest

from app.domains.task_execution.workflow_operators.create_trip_operator import (
    CreateTripOperator,
)


def damascus_today():
    return (datetime.utcnow() + timedelta(hours=3)).strftime("%Y-%m-%d")


class _StartTripExecution:
    operator = "start_trip_operator"

    def __init__(self, result):
        self.result = result


class _OtherExecution:
    operator = "trip_stop_operator"

    def __init__(self):
        self.result = {"trip_name": "should never be read from here"}


class _Operator(CreateTripOperator):
    """Only `all_tasks_executions` is needed to read the name back."""

    def __init__(self, *executions):
        self.all_tasks_executions = list(executions)


def name_from(result):
    return _Operator(_StartTripExecution(result)).get_trip_name()


@pytest.mark.parametrize("result", [
    {},                          # the field was never sent
    {"trip_name": ""},           # left blank on the form
    {"trip_name": "   "},        # whitespace only
    {"trip_name": None},         # explicitly null
])
def test_a_blank_name_defaults_to_the_date(result):
    assert name_from(result) == damascus_today()


def test_a_missing_result_defaults_too():
    """A task execution can carry a null result; that must not raise."""
    assert name_from(None) == damascus_today()


def test_the_default_is_damascus_local_not_utc():
    """Pinned as a date-shaped string in ISO order, which sorts correctly and
    reads the same in an English or an Arabic UI."""
    got = name_from({})
    assert len(got) == 10 and got.count("-") == 2
    assert got == (datetime.utcnow() + timedelta(hours=3)).strftime("%Y-%m-%d")
    # and it is genuinely offset from UTC, so the +3 is not decorative
    assert (datetime.utcnow() + timedelta(hours=3)) > datetime.utcnow()


def test_a_typed_name_wins():
    assert name_from({"trip_name": "Sunday Malki run"}) == "Sunday Malki run"


def test_a_typed_name_is_trimmed():
    assert name_from({"trip_name": "  Aleppo route  "}) == "Aleppo route"


def test_a_long_name_is_cut_to_the_column_width():
    """The column is String(120); a longer value would raise on flush instead of
    being saved, so it is truncated here rather than at the database."""
    assert len(name_from({"trip_name": "x" * 500})) == 120


def test_only_the_start_trip_task_is_consulted():
    """Other operators' results can contain anything; the name comes from the
    start-trip form alone."""
    op = _Operator(_OtherExecution(), _StartTripExecution({"trip_name": "real one"}))
    assert op.get_trip_name() == "real one"


def test_no_start_trip_task_at_all_still_yields_a_name():
    assert _Operator(_OtherExecution()).get_trip_name() == damascus_today()


# --- the key the web actually posts under ---------------------------------
#
# The web client posts task results keyed by field.LABEL, not field.name
# (frontend/.../WorkflowExecutionTaskDetail.tsx: result[field.label] = data[field.name]),
# while the Expo app keys by field.name. StartTripOperatorSchema forbids extra
# keys, so if the form descriptor's label ever drifts from its name, every
# start-trip submission from the WEB is rejected while the app keeps working.
#
# That is not hypothetical: this migration first shipped with label "trip name"
# against name "trip_name", and the tests above could not see it because they call
# get_trip_name() directly. These two assert the contract from both clients' side.

def test_the_form_descriptors_label_matches_its_name():
    """Whatever the migration writes must be usable as a schema key."""
    from migrations.versions.c3e81f5a29b7_trip_name import TRIP_NAME_FIELD

    assert TRIP_NAME_FIELD["label"] == TRIP_NAME_FIELD["name"], (
        "the web posts results keyed by label; a label that is not a declared "
        "schema field is rejected by extra='forbid'"
    )


@pytest.mark.parametrize("key_source", ["name", "label"])
def test_the_start_trip_schema_accepts_the_key_either_client_would_send(key_source):
    from app.domains.task_execution.workflow_operators.start_trip_operator import (
        StartTripOperatorSchema,
    )
    from migrations.versions.c3e81f5a29b7_trip_name import TRIP_NAME_FIELD

    key = TRIP_NAME_FIELD[key_source]
    # manual mode is the shortest valid submission: vehicle plate + assignee.
    # A routed trip additionally demands service areas, both warehouses and the
    # visit threshold (see check_required_by_mode).
    schema = StartTripOperatorSchema(**{
        "vehicle_plate": "ABC-123",
        "manual_stops": ["yes"],
        "assigned_user_uuid": "zaid",
        key: "Sunday run",
    })
    assert schema.trip_name == "Sunday run"
