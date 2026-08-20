"""Cross-tenant exposure of dynamic per-stop tasks (real query, real SQLite).

Migration f8c3d5a27e91 dropped account_uuid from `task` because definitions
are platform-global, but the trip flow mints per-stop tasks into the same
table (workflow_uuid NULL) with the customer's full contact snapshot in
task_inputs. With no column, the generic repo scoping did nothing and
GET /task/<uuid> — reachable by any tenant's driver — served any tenant's
customer PII to any other tenant.

TaskRepository now derives tenancy for dynamic rows through their
task_execution (created in the same transaction, account_uuid non-nullable).
These tests run the real repository against the real models to pin:

- definitions stay readable in every scope,
- a tenant sees its own dynamic rows and never another tenant's,
- unscoped access (workers, scripts) still sees everything,
- an orphaned dynamic row (no execution) belongs to nobody,
- the create-then-read window inside one transaction still works.
"""
import json
import sqlite3

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from app.adapters.repositories.task_repository import TaskRepository
from models.common import Task, TaskExecution

# The models use Postgres-only column types; render them as JSON so the
# tables can be created on SQLite, and bind the list values (the ARRAY
# columns' defaults) as JSON text — psycopg2 handles lists natively but
# sqlite3 refuses them.


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _array_on_sqlite(type_, compiler, **kw):
    return "JSON"


sqlite3.register_adapter(list, json.dumps)


ACCOUNT_A = "acct-a"
ACCOUNT_B = "acct-b"

DEFINITION = "task-definition"
DYNAMIC_A = "task-dynamic-a"
DYNAMIC_B = "task-dynamic-b"
ORPHAN = "task-orphan"


def _task(uuid, workflow_uuid, task_inputs=None):
    return Task(
        uuid=uuid,
        name=uuid,
        operator="trip_stop_operator",
        workflow_uuid=workflow_uuid,
        task_inputs=task_inputs or {},
        is_deleted=False,
    )


def _execution(task_uuid, account_uuid):
    return TaskExecution(
        uuid=f"te-{task_uuid}",
        account_uuid=account_uuid,
        task_uuid=task_uuid,
        workflow_execution_uuid=f"we-{account_uuid}",
        status="in_progress",
    )


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    Task.__table__.create(engine)
    TaskExecution.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    session.add_all([
        _task(DEFINITION, workflow_uuid="wf-1"),
        _task(DYNAMIC_A, workflow_uuid=None,
              task_inputs={"data": {"customer": {"phone": "a-secret"}}}),
        _task(DYNAMIC_B, workflow_uuid=None,
              task_inputs={"data": {"customer": {"phone": "b-secret"}}}),
        _task(ORPHAN, workflow_uuid=None),
    ])
    session.add_all([
        _execution(DYNAMIC_A, ACCOUNT_A),
        _execution(DYNAMIC_B, ACCOUNT_B),
    ])
    session.commit()
    yield session
    session.close()


def _repo(session, account_uuid):
    return TaskRepository(session=session, account_uuid=account_uuid)


def _visible_uuids(repo):
    page = repo.find_all_by_filters_paginated(
        filters=[Task.is_deleted == False], page=1, per_page=100,
    )
    return {task.uuid for task in page.items}


# --- the exposure ------------------------------------------------------------

def test_another_tenant_cannot_read_a_dynamic_task_by_uuid(session):
    assert _repo(session, ACCOUNT_B).find_one(uuid=DYNAMIC_A, is_deleted=False) is None


def test_another_tenant_cannot_enumerate_dynamic_tasks_in_the_list(session):
    visible = _visible_uuids(_repo(session, ACCOUNT_B))
    assert DYNAMIC_A not in visible
    assert visible == {DEFINITION, DYNAMIC_B}


# --- the legitimate flows ----------------------------------------------------

def test_a_tenant_still_reads_its_own_stop_task(session):
    task = _repo(session, ACCOUNT_A).find_one(uuid=DYNAMIC_A, is_deleted=False)
    assert task is not None
    assert task.task_inputs["data"]["customer"]["phone"] == "a-secret"


def test_definitions_stay_readable_by_every_tenant(session):
    for account in (ACCOUNT_A, ACCOUNT_B):
        assert _repo(session, account).find_one(uuid=DEFINITION) is not None


def test_definitions_stay_findable_by_name_and_workflow(session):
    # validate_depends_on resolves definition tasks this way
    task = _repo(session, ACCOUNT_B).find_one(
        name=DEFINITION, workflow_uuid="wf-1", is_deleted=False,
    )
    assert task is not None


def test_unscoped_access_still_sees_everything(session):
    repo = _repo(session, None)
    assert repo.find_one(uuid=DYNAMIC_A) is not None
    assert repo.find_one(uuid=DYNAMIC_B) is not None
    assert _visible_uuids(repo) == {DEFINITION, DYNAMIC_A, DYNAMIC_B, ORPHAN}


def test_find_all_and_find_first_respect_the_scope(session):
    repo = _repo(session, ACCOUNT_B)
    dynamic = repo.find_all(workflow_uuid=None)
    assert {task.uuid for task in dynamic} == {DYNAMIC_B}
    assert repo.find_first(uuid=DYNAMIC_A) is None
    assert repo.find_first(uuid=DYNAMIC_B) is not None


# --- edges -------------------------------------------------------------------

def test_an_orphaned_dynamic_task_belongs_to_nobody(session):
    for account in (ACCOUNT_A, ACCOUNT_B):
        assert _repo(session, account).find_one(uuid=ORPHAN) is None


def test_a_task_is_readable_in_the_transaction_that_creates_it(session):
    """create_trip_stop_with_task saves the task, then its execution, then
    reads related rows — all before commit. Autoflush must keep the just-
    minted task visible to its own scoped repo inside that window."""
    repo = _repo(session, ACCOUNT_A)
    repo.save(_task("task-fresh", workflow_uuid=None), commit=False)
    session.add(_execution("task-fresh", ACCOUNT_A))
    assert repo.find_one(uuid="task-fresh") is not None
    session.rollback()
