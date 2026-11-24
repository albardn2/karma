"""Reads a workflow execution cannot run without.

A trip's setup form renders the fields of its task definition (GET /task/<uuid>)
and lists the account's routing strategies (GET /routing-strategy/). A
permissions object that grants reading workflow executions but not those two
resources leaves the form empty: the default feature cap for new accounts did
exactly that, so every new company saw "No input fields defined" on its first
trip.
"""
import pytest

from app.entrypoint.routes.common.permissions import endpoint_allowed

EXECUTION_READER = {"endpoints": {"workflow_execution": ["read"]}}
NO_EXECUTIONS = {"endpoints": {"customer": ["create", "read", "update", "delete"]}}
DEPENDENCIES = ["workflow", "task", "routing_strategy"]


@pytest.mark.parametrize("blueprint", DEPENDENCIES)
def test_reading_executions_implies_reading_what_they_run_on(blueprint):
    assert endpoint_allowed(EXECUTION_READER, blueprint, "GET"), (
        f"workflow_execution read must imply {blueprint} read"
    )


@pytest.mark.parametrize("blueprint", DEPENDENCIES)
@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_the_implied_access_is_read_only(blueprint, method):
    assert not endpoint_allowed(EXECUTION_READER, blueprint, method), (
        f"{method} on {blueprint} must still need its own grant"
    )


@pytest.mark.parametrize("blueprint", DEPENDENCIES)
def test_without_executions_the_dependencies_stay_closed(blueprint):
    assert not endpoint_allowed(NO_EXECUTIONS, blueprint, "GET"), (
        f"{blueprint} read must not open up without workflow_execution read"
    )


def test_an_explicit_grant_still_counts_on_its_own():
    explicit = {"endpoints": {"routing_strategy": ["read", "update"]}}

    assert endpoint_allowed(explicit, "routing_strategy", "PUT")
