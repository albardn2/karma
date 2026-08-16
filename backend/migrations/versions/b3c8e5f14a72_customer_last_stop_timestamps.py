"""Record when a customer was last visited, and last actually reached.

Two derived timestamps on customer, recomputed by the trip-stop operator every
time a stop completes:

  last_stop           — the last completed stop, whatever came of it
  last_effective_stop — the last one that reached the customer, i.e. any
                        outcome outside the skipped:* family

Both are backfilled from history so they are useful on day one rather than in
three months.

A stop counts as completed when its task execution reached `completed`, or —
for legacy rows with no task execution — when it carries an outcome. Note what
is deliberately NOT used: trip_stop.status, which no code path ever advances
past in_progress (184 of 187 non-cancelled stops in one production-shaped
database still sit there, 19 of them with outcomes recorded). The timestamp is
the task execution's end_time, falling back to the stop's created_at.

The query below is the SAME one the running code issues on every completion
(app/domains/customer/visit_dates.py). That is the point: these columns are
recomputed rather than stamped forward, so a backfilled value and a freshly
written one come out of identical logic and cannot drift apart. Keep the two in
step — tests/domains/test_customer_visit_dates.py pins the effective-outcome
predicate against the Python function it mirrors.

Revision ID: b3c8e5f14a72
Revises: f4a2d7c9e1b6
"""
import sqlalchemy as sa
from alembic import op

revision = 'b3c8e5f14a72'
down_revision = 'f4a2d7c9e1b6'
branch_labels = None
depends_on = None


# The FILTER mirrors is_effective_outcome() term for term: take the machine half
# (split once on ' - '), trim it as the Python does, treat an unreadable outcome
# as reaching nobody, and compare the family before ':' against 'skipped'.
_BACKFILL = """
UPDATE customer AS c
SET last_stop = agg.last_stop,
    last_effective_stop = agg.last_effective_stop
FROM (
    SELECT ts.customer_uuid,
           MAX(COALESCE(te.end_time, ts.created_at)) AS last_stop,
           MAX(COALESCE(te.end_time, ts.created_at)) FILTER (
               WHERE btrim(split_part(ts.outcome, ' - ', 1)) <> ''
                 AND split_part(btrim(split_part(ts.outcome, ' - ', 1)), ':', 1) <> 'skipped'
           ) AS last_effective_stop
    FROM trip_stop ts
    LEFT JOIN task_execution te ON te.uuid = ts.task_execution_uuid
    WHERE ts.customer_uuid IS NOT NULL
      AND (te.status = 'completed' OR btrim(COALESCE(ts.outcome, '')) <> '')
    GROUP BY ts.customer_uuid
) AS agg
WHERE c.uuid = agg.customer_uuid
"""


def upgrade():
    op.add_column('customer', sa.Column('last_stop', sa.DateTime(), nullable=True))
    op.add_column('customer', sa.Column('last_effective_stop', sa.DateTime(), nullable=True))
    op.execute(_BACKFILL)


def downgrade():
    op.drop_column('customer', 'last_effective_stop')
    op.drop_column('customer', 'last_stop')
