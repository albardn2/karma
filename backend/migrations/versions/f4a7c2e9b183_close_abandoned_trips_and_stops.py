"""Close trips that were started and then abandoned, and the stops under them.

Every trip_stop should be resolved: completed, skipped, or cancelled. A stop
left `in_progress` is not cosmetic — the routing pool excludes any customer
holding a stop that has not reached a finished status, so such a stop makes its
customer permanently unroutable, on behalf of a trip nobody is working.

c1d4f7a92b58 already repaired two populations: stops that were WORKED but never
advanced past in_progress, and stops left open on trips that were since DELETED.
This is the third and last one it did not cover — stops that were never worked,
on live trips that were never finished and never cancelled.

WHY THOSE TRIPS CANNOT DRAIN ON THEIR OWN. trip_finish_operator refuses to
finish a trip while any trip-stop task execution is still not_started or
in_progress, so an abandoned trip has exactly two exits: someone works every
remaining stop, or someone cancels it. Neither happened. Cancelling the stops
alone would not help — the trip would stay in_progress with its task executions
still open, permanently unfinishable and still reading as active work. So the
repair is the whole cancellation, not just the stops.

WHAT IT DOES, mirroring the application's own cancel path term for term
(workflow_execution/domain.cancel_workflow_execution -> trip/domain.cancel_trip
-> task_execution/domain.cancel_task_executions), so a row repaired here is
indistinguishable from one a user cancelled in the app:

  1. stops that were actually WORKED  -> completed / skipped by their outcome
  2. stops never worked              -> cancelled
  3. the trips                        -> cancelled, with end_time
  4. their task executions           -> cancelled, with end_time and a message
  5. their workflow executions       -> cancelled, with end_time and a message

Step 1 is deliberately kept even though it should now be empty: it is the same
rule c1d4f7a92b58 applied, re-stated so that a stop worked between that
migration and this one is classified by its outcome rather than swept into
`cancelled`. Cancelling a stop a rep actually worked would erase what they
reported and, via customer.last_effective_stop, the fact that the customer was
reached.

WHAT IT DELIBERATELY DOES NOT DO. Inventory is untouched. Cancelling a trip in
the app does not unwind the vehicle's load either, and cancelling touches no
customer order or invoice — a sale made at a worked stop is real and stays real.
Orders and their debt therefore survive this repair, exactly as they survive a
cancellation performed by a user.

THE ONE JUDGEMENT CALL. "Abandoned" is defined structurally — a non-terminal
trip — with NO age cutoff, because that is what was asked for: as of now, no
stop should be in progress. A trip genuinely in flight at the moment this runs
would therefore also be cancelled. Run the audit in
docs/audit_dangling_stops.sql against the target database FIRST; its third
section lists anything touched in the last three days, and it returning rows is
the signal to hold this migration back rather than run it.

Revision ID: f4a7c2e9b183
Revises: c7f2a9e10b34
"""
from alembic import op

revision = 'f4a7c2e9b183'
down_revision = 'c7f2a9e10b34'
branch_labels = None
depends_on = None


# A stop counts as worked if it carries an outcome or its task execution
# reached completed — the same predicate customer/visit_dates.py uses, so the
# set marked completed/skipped here is exactly the set customer.last_stop
# already counts as a visit. The two derived facts cannot disagree.
_WORKED = """
        btrim(COALESCE(ts.outcome, '')) <> ''
     OR EXISTS (
            SELECT 1 FROM task_execution te
            WHERE te.uuid = ts.task_execution_uuid
              AND te.status = 'completed'
        )
"""

# Non-terminal trips. NULL is spelled out: `NOT IN (...)` yields NULL for a NULL
# status, which would quietly exclude a status-less trip from the repair.
_ABANDONED_TRIPS = """
    SELECT uuid FROM trip
    WHERE status IS NULL OR status NOT IN ('completed', 'cancelled')
"""

# 1. Worked stops keep what the rep reported. The CASE mirrors
#    trip_stop_operator.status_for_outcome: the machine half (split once on
#    ' - '), trimmed as the Python does, family before ':' compared to
#    'skipped'. A BLANK outcome is a completion, not a skip — the column is an
#    unvalidated string so a completion can carry ''.
_CLASSIFY_WORKED = f"""
UPDATE trip_stop AS ts
SET status = CASE
        WHEN split_part(btrim(split_part(ts.outcome, ' - ', 1)), ':', 1) = 'skipped'
            THEN 'skipped'
        ELSE 'completed'
    END
WHERE (ts.status IS NULL OR ts.status NOT IN ('completed', 'skipped', 'cancelled'))
  AND ts.trip_uuid IN ({_ABANDONED_TRIPS})
  AND ({_WORKED})
"""

# 2. Everything else under those trips was never worked.
_CANCEL_UNWORKED = f"""
UPDATE trip_stop AS ts
SET status = 'cancelled'
WHERE (ts.status IS NULL OR ts.status NOT IN ('completed', 'skipped', 'cancelled'))
  AND ts.trip_uuid IN ({_ABANDONED_TRIPS})
"""

# 3. The trips. end_time is set because cancel_trip sets it, and a cancelled
#    trip with no end_time reads as still running in the trip history.
_CANCEL_TRIPS = """
UPDATE trip
SET status = 'cancelled',
    end_time = COALESCE(end_time, now())
WHERE status IS NULL OR status NOT IN ('completed', 'cancelled')
"""

# 4. Their task executions, including children, with the message the
#    application writes. 'failed' joins the terminal set here exactly as it does
#    in cancel_task_executions — a failed step must not be rewritten.
_CANCEL_TASK_EXECUTIONS = """
UPDATE task_execution te
SET status = 'cancelled',
    end_time = COALESCE(te.end_time, now()),
    error_message = COALESCE(te.error_message, 'Task execution was cancelled by user')
WHERE (te.status IS NULL OR te.status NOT IN ('completed', 'cancelled', 'failed'))
  AND te.workflow_execution_uuid IN (
        SELECT we.uuid FROM workflow_execution we
        WHERE we.status IS NULL OR we.status NOT IN ('completed', 'cancelled', 'failed')
  )
  AND te.workflow_execution_uuid IN (SELECT workflow_execution_uuid FROM trip)
"""

# 5. The workflow executions that own those trips.
_CANCEL_WORKFLOWS = """
UPDATE workflow_execution we
SET status = 'cancelled',
    end_time = COALESCE(we.end_time, now()),
    error_message = COALESCE(we.error_message, 'Workflow execution was cancelled by user')
WHERE (we.status IS NULL OR we.status NOT IN ('completed', 'cancelled', 'failed'))
  AND we.uuid IN (SELECT workflow_execution_uuid FROM trip WHERE workflow_execution_uuid IS NOT NULL)
"""


def upgrade():
    # Order matters: the stop and trip statements read `trip` to find which
    # trips are abandoned, so the trips must be cancelled LAST or the subquery
    # would already be empty. Likewise the task-execution statement reads
    # workflow_execution, so workflows are cancelled after it.
    op.execute(_CLASSIFY_WORKED)
    op.execute(_CANCEL_UNWORKED)
    op.execute(_CANCEL_TASK_EXECUTIONS)
    op.execute(_CANCEL_WORKFLOWS)
    op.execute(_CANCEL_TRIPS)


def downgrade():
    # Deliberately a no-op, for the same reason c1d4f7a92b58's is. Sending these
    # rows back to in_progress would not restore the previous state: it would
    # also reopen trips and stops that have been cancelled legitimately since,
    # and after the fact the two are indistinguishable.
    pass
