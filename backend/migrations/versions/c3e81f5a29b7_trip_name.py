"""Give a trip an optional name.

A trip is identified today by a truncated uuid on the web list and by its vehicle
plate in the app, neither of which tells you which run it was. This adds a short
free-text name, filled in on the start-trip form and defaulting to the date the
trip started, so a dispatcher can say "the one from Sunday" and find it.

Nullable, and no backfill: every trip that predates this genuinely has no name,
and inventing one from `start_time` after the fact would put a value in the column
that nobody typed. The clients fall back to what they show today when it is null,
so old rows read exactly as before.

It lives on `trip`, not on `workflow_execution`, for two reasons that are not
matters of taste. `WorkflowExecution.name` is already a hybrid property returning
the *workflow template's* name and the execution list filters on it with `ilike`,
so a column of that name there would shadow it and break that filter. And trips
exist with no execution at all — the web "Add Trip" dialog posts `/trip/` without
one — so a name held on the execution could never label those rows.

No index: the name is displayed, never filtered on.

The second half of this migration is data, not schema. The start-trip form is not
in code — it is the `task_inputs.fields` JSON of the single row with
`operator = 'start_trip_operator'`, which both clients render dynamically. Adding
the field descriptor there is what makes the input appear, on web and in the app,
with no client change.

Revision ID: c3e81f5a29b7
Revises: b4d9c2f7a651
"""
import json

import sqlalchemy as sa
from alembic import op

revision = 'c3e81f5a29b7'
down_revision = 'b4d9c2f7a651'
branch_labels = None
depends_on = None


# Appended to the start-trip form. `name` is the key the operator reads back out
# of the task result; `label` is what the clients render (both prettify it).
TRIP_NAME_FIELD = {
    "name": "trip_name",
    "label": "trip name",
    "type": "text",
    "required": False,
    "placeholder": "Optional — defaults to today's date",
    "min": None,
    "max": None,
    "options": None,
    "button_text": None,
    "multiple": False,
    "accept": None,
    "rows": None,
    "cols": None,
    "min_length": None,
    "max_length": 120,
}


def _start_trip_tasks(conn):
    return conn.execute(
        sa.text("SELECT uuid, task_inputs FROM task WHERE operator = 'start_trip_operator'")
    ).fetchall()


def upgrade():
    op.add_column('trip', sa.Column('name', sa.String(length=120), nullable=True))

    conn = op.get_bind()
    for row in _start_trip_tasks(conn):
        task_uuid, task_inputs = row[0], row[1]
        inputs = dict(task_inputs or {})
        fields = list(inputs.get("fields") or [])
        # idempotent: never add the field twice if this is re-run
        if any((f or {}).get("name") == TRIP_NAME_FIELD["name"] for f in fields):
            continue
        # first, so it reads as the heading of the form rather than an afterthought
        inputs["fields"] = [TRIP_NAME_FIELD] + fields
        conn.execute(
            sa.text("UPDATE task SET task_inputs = CAST(:inputs AS jsonb) WHERE uuid = :uuid"),
            {"inputs": json.dumps(inputs), "uuid": task_uuid},
        )


def downgrade():
    conn = op.get_bind()
    for row in _start_trip_tasks(conn):
        task_uuid, task_inputs = row[0], row[1]
        inputs = dict(task_inputs or {})
        fields = [f for f in (inputs.get("fields") or [])
                  if (f or {}).get("name") != TRIP_NAME_FIELD["name"]]
        inputs["fields"] = fields
        conn.execute(
            sa.text("UPDATE task SET task_inputs = CAST(:inputs AS jsonb) WHERE uuid = :uuid"),
            {"inputs": json.dumps(inputs), "uuid": task_uuid},
        )

    op.drop_column('trip', 'name')
