"""Record when a customer was last visited, and last actually reached.

Two derived timestamps on customer, written by the trip-stop operator when a
stop completes:

  last_stop           — the last completed stop, whatever came of it
  last_effective_stop — the last one that reached the customer, i.e. any
                        outcome outside the skipped:* family

Both are backfilled from history so they are useful on day one rather than in
three months. A stop counts as completed if it carries an outcome: that is
written at exactly the moment the operator completes it, which makes it a far
more reliable marker than trip_stop.status (never advanced past in_progress by
any code path — 184 of 187 non-cancelled stops in one production-shaped
database still sit at in_progress, 19 of them with outcomes recorded).

The timestamp is the task execution's end_time, falling back to the stop's
created_at for legacy rows that predate task executions. "Effective" is decided
the same way the runtime does it — the family before the first ':' of the
machine half of the outcome — so the backfilled values and the ones written
from now on mean the same thing.

Revision ID: b3c8e5f14a72
Revises: f4a2d7c9e1b6
"""
import sqlalchemy as sa
from alembic import op

revision = 'b3c8e5f14a72'
down_revision = 'f4a2d7c9e1b6'
branch_labels = None
depends_on = None


# split_part(outcome, ' - ', 1) is the machine half ("skipped:no_time"), and
# split_part(..., ':', 1) is its family — the same two splits the Python does.
_BACKFILL = """
UPDATE customer AS c
SET last_stop = agg.last_stop,
    last_effective_stop = agg.last_effective_stop
FROM (
    SELECT ts.customer_uuid,
           MAX(COALESCE(te.end_time, ts.created_at)) AS last_stop,
           MAX(COALESCE(te.end_time, ts.created_at))
               FILTER (
                   WHERE split_part(split_part(ts.outcome, ' - ', 1), ':', 1) <> 'skipped'
               ) AS last_effective_stop
    FROM trip_stop ts
    LEFT JOIN task_execution te ON te.uuid = ts.task_execution_uuid
    WHERE ts.customer_uuid IS NOT NULL
      AND ts.outcome IS NOT NULL
      AND btrim(ts.outcome) <> ''
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
