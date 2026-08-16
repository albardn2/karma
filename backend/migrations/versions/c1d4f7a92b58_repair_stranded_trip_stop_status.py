"""Un-stick trip stops that were worked but never left in_progress.

trip_stop.status was written IN_PROGRESS when the stop was created and, until
now, by nothing else except trip cancellation. The operator that completes a
stop recorded an outcome but never advanced the status, so every stop ever
worked still reads as in flight.

That was not cosmetic. The distribution query
(customer_repository.fetch_distribution_customers_for_polygon) excludes any
customer holding a planned/in_progress stop, so a customer became permanently
ineligible for routing the first time they appeared on a trip — 166 of 269 live
customers in one production-shaped database. Its companion rule, "do not
revisit within N days", keys on status = 'completed' and therefore matched
almost nothing, so the threshold never actually applied.

The operator now sets the status (trip_stop_operator.status_for_outcome). This
repairs the rows already stranded, by the same rule:

  * an explicit skipped:* outcome  -> skipped
  * anything else                  -> completed

"Anything else" includes a blank outcome. The outcome column is an unvalidated
string, so a completion can carry '', and two such rows exist here; the rep
still worked the stop, and calling it skipped would wrongly keep the customer
eligible for an immediate revisit.

A stop counts as worked if it carries an outcome, or its task execution reached
`completed` — the same predicate visit_dates.py uses, so the set marked
completed/skipped here is exactly the set customer.last_stop already counts as a
visit; the two derived facts cannot disagree. Stops still genuinely in flight,
planned stops, and cancelled stops are untouched.

A second statement cancels stops left open on trips that were since DELETED.
Deleting a trip cancels its open stops today, but rows deleted before that code
existed still read in_progress, and the distribution filter neither joins Trip
nor excludes deleted ones — so they block their customers from ever being routed
again, on behalf of a trip nobody can see.

Revision ID: c1d4f7a92b58
Revises: b3c8e5f14a72
"""
from alembic import op

revision = 'c1d4f7a92b58'
down_revision = 'b3c8e5f14a72'
branch_labels = None
depends_on = None


# The CASE mirrors trip_stop_operator.status_for_outcome: take the machine half
# (split once on ' - '), trim it as the Python does, and compare the family
# before ':' against 'skipped'.
_REPAIR = """
UPDATE trip_stop AS ts
SET status = CASE
        WHEN split_part(btrim(split_part(ts.outcome, ' - ', 1)), ':', 1) = 'skipped'
            THEN 'skipped'
        ELSE 'completed'
    END
WHERE ts.status = 'in_progress'
  AND (
        btrim(COALESCE(ts.outcome, '')) <> ''
     OR EXISTS (
            SELECT 1 FROM task_execution te
            WHERE te.uuid = ts.task_execution_uuid
              AND te.status = 'completed'
        )
  )
"""


# Stops left open on a trip that was deleted. Deleting a trip cancels its open
# stops today (trip/routes.py), but rows deleted before that existed still read
# planned/in_progress, and the distribution filter neither joins Trip nor
# excludes deleted ones — so those stops block their customers from ever being
# routed again, on a trip nobody can see. Same repair the live code performs,
# applied to the rows that predate it.
_CANCEL_ORPHANED = """
UPDATE trip_stop
SET status = 'cancelled'
WHERE status IN ('planned', 'in_progress')
  AND trip_uuid IN (SELECT uuid FROM trip WHERE is_deleted)
"""


def upgrade():
    op.execute(_REPAIR)
    op.execute(_CANCEL_ORPHANED)


def downgrade():
    # Deliberately a no-op. Sending completed/skipped back to in_progress would
    # not restore the previous state — it would also un-do stops the fixed
    # operator has since completed correctly, re-creating the very bug this
    # repairs, and the two are indistinguishable after the fact.
    pass
