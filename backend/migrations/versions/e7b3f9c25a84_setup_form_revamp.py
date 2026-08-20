"""Rebuild the trip setup form: six fields, strategy replaces the mode toggle.

The distribution revamp starts here. The setup_trip_config form (task_inputs on
the platform-global task row — the form is DB data, patched by migration as
before: f4b8d2e6a1c9, c3e81f5a29b7) becomes:

  service_areas   checklist, MULTI-pick (the old descriptor said multiple=false,
                  which contradicted both what a checklist is for and what the
                  routing actually consumed — fixed in passing)
  assigned_user_uuid  select, required
  assigned_date   single-pick checklist, required; options are NOT stored —
                  dto/task.py generates today..+7 (dd-mm-yyyy, Damascus-local)
                  on every read, because a baked list of dates is stale by
                  tomorrow
  desired_stops   number 1..200, optional
  strategy        select, defaults to manual (no-op routing); options come from
                  trip_setup.FORM_STRATEGIES at read time and grow as the
                  routing revamp lands algorithms
  vehicle_plate   select, required — a trip cannot exist without a vehicle (the
                  column is NOT NULL and the van-stock snapshot hangs off it);
                  the flow revamp may move this to a later step, not this one

Dropped: trip_name (the Damascus-date default was the normal case anyway),
manual_stops (subsumed by strategy=manual), start/end_warehouse_name and
last_visit_threshold_days and customer_categories and max/min_stops (routing
inputs, back with the new algorithms), start/end_point (dead — never consumed
by any operator).

Executions already in flight keep their stored results; every reader resolves
the old shape through trip_setup.resolve_strategy. The downgrade restores the
old 13-field form for NEW executions; in-flight results are untouched either way.

Revision ID: e7b3f9c25a84
Revises: c1d4f7a92b58
"""
import json

from alembic import op

revision = 'e7b3f9c25a84'
down_revision = 'c1d4f7a92b58'
branch_labels = None
depends_on = None


def _field(name, ftype, *, required=False, options=None, multiple=False,
           minimum=None, maximum=None, placeholder=None, max_length=None):
    """One TaskInputField descriptor, all keys present like the existing rows."""
    return {
        "name": name, "label": name, "type": ftype,
        "required": required, "options": options, "multiple": multiple,
        "min": minimum, "max": maximum, "placeholder": placeholder,
        "max_length": max_length, "min_length": None,
        "rows": None, "cols": None, "accept": None, "button_text": None,
    }


NEW_FIELDS = [
    _field("service_areas", "checklist", options=[], multiple=True),
    _field("assigned_user_uuid", "select", required=True, options=[]),
    # options deliberately empty in storage; generated per read (see docstring)
    _field("assigned_date", "checklist", required=True, options=[], multiple=False),
    _field("desired_stops", "number", minimum=1, maximum=200),
    _field("strategy", "select", options=["manual"], placeholder="manual"),
    _field("vehicle_plate", "select", required=True, options=[]),
]

OLD_FIELDS = [
    _field("trip_name", "text", max_length=120,
           placeholder="Optional — defaults to today's date"),
    _field("manual_stops", "checklist", options=["yes"]),
    _field("service_areas", "checklist", options=[]),
    _field("start_warehouse_name", "select", options=[]),
    _field("end_warehouse_name", "select", options=[]),
    _field("start_point", "text"),
    _field("end_point", "text"),
    _field("assigned_user_uuid", "select", options=[], placeholder=""),
    _field("customer_categories", "checklist", options=[]),
    _field("vehicle_plate", "select", options=[]),
    _field("last_visit_threshold_days", "number", minimum=1, maximum=100),
    _field("max_stops", "number", minimum=0, maximum=200),
    _field("min_stops", "number", minimum=0, maximum=200),
]


def _set_fields(fields):
    payload = json.dumps({"data": None, "fields": fields})
    # keyed on name+operator: the one global template row (workflow_uuid set),
    # never the per-trip throwaway task rows (those are stop/finish tasks and
    # have different operators anyway)
    op.execute(
        "UPDATE task SET task_inputs = '"
        + payload.replace("'", "''")
        + "'::jsonb WHERE name = 'setup_trip_config' AND operator = 'start_trip_operator'"
    )


def upgrade():
    _set_fields(NEW_FIELDS)


def downgrade():
    _set_fields(OLD_FIELDS)
