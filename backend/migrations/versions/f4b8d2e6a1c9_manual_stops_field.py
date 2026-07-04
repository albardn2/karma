"""add the manual_stops checkbox to start_trip task definitions and relax
routing-field required flags (per-mode validation now lives in the backend
StartTripOperatorSchema)

Revision ID: f4b8d2e6a1c9
Revises: e9a3b5c7d1f6
Create Date: 2026-07-04

"""
import json

from alembic import op
import sqlalchemy as sa


revision = 'f4b8d2e6a1c9'
down_revision = 'e9a3b5c7d1f6'
branch_labels = None
depends_on = None

# fields the backend now requires conditionally (routed mode only)
ROUTING_FIELDS = {
    "service_areas", "start_warehouse_name", "end_warehouse_name",
    "start_point", "end_point", "customer_categories",
    "last_visit_threshold_days", "max_stops", "min_stops",
}

MANUAL_STOPS_FIELD = {
    "name": "manual_stops", "label": "manual_stops", "type": "checklist",
    "options": ["yes"], "required": False, "multiple": False,
    "max": None, "min": None, "cols": None, "rows": None, "accept": None,
    "max_length": None, "min_length": None, "button_text": None, "placeholder": None,
}


def _load(task_inputs):
    if isinstance(task_inputs, str):
        return json.loads(task_inputs)
    return task_inputs or {}


def upgrade():
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT uuid, task_inputs FROM task "
        "WHERE operator = 'start_trip_operator' AND is_deleted = false"
    )).fetchall()

    for task_uuid, task_inputs in rows:
        ti = _load(task_inputs)
        fields = ti.get("fields") or []
        changed = False

        if not any(f.get("name") == "manual_stops" for f in fields):
            fields.insert(0, dict(MANUAL_STOPS_FIELD))
            changed = True

        for f in fields:
            if f.get("name") in ROUTING_FIELDS and f.get("required"):
                f["required"] = False
                changed = True

        if changed:
            ti["fields"] = fields
            conn.execute(
                sa.text("UPDATE task SET task_inputs = (:ti)::jsonb WHERE uuid = :u"),
                {"ti": json.dumps(ti), "u": task_uuid},
            )


def downgrade():
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT uuid, task_inputs FROM task "
        "WHERE operator = 'start_trip_operator' AND is_deleted = false"
    )).fetchall()

    # the originally-required routing fields (pre manual-stops)
    previously_required = {
        "service_areas", "start_warehouse_name", "end_warehouse_name",
        "last_visit_threshold_days",
    }
    for task_uuid, task_inputs in rows:
        ti = _load(task_inputs)
        fields = [f for f in (ti.get("fields") or []) if f.get("name") != "manual_stops"]
        for f in fields:
            if f.get("name") in previously_required:
                f["required"] = True
        ti["fields"] = fields
        conn.execute(
            sa.text("UPDATE task SET task_inputs = (:ti)::jsonb WHERE uuid = :u"),
            {"ti": json.dumps(ti), "u": task_uuid},
        )
