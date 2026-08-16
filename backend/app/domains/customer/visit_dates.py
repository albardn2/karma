"""When a customer was last visited, and last actually reached.

customer.last_stop and customer.last_effective_stop are denormalised off
trip_stop so "who hasn't been seen lately" is a column read. Both are RECOMPUTED
from the customer's stops every time one completes, rather than stamped forward
with the current timestamp.

Recomputing costs one extra query per completion and buys two things that
stamping cannot:

  * CORRECTIONS WORK. The web lets a completed stop be re-completed with a
    corrected outcome ("update"), and the correction overwrites the stop's
    outcome in place. A stamp-forward would leave last_effective_stop asserting
    a visit that the correction erased — a sale rewritten to
    skipped:customer_not_available would keep claiming the customer was reached.
    Recomputing walks back to the previous genuinely-effective stop, or to NULL
    if there is none. Blindly clearing the field instead would be wrong: it
    would also discard an older effective stop that is still perfectly valid.

  * THE BACKFILL AND THE RUNTIME CANNOT DRIFT. The migration that introduced
    these columns backfills them with this same definition. Because the running
    code now issues the same query, the two agree by construction instead of by
    two hand-written rules that have to be kept in step.

The definition of a completed stop is deliberately NOT "has an outcome": the
outcome column is a free string the API never validates, so a completion can
carry ''. Such a stop still happened, and still counts as a visit — it is the
task execution reaching `completed` that makes it real.
"""
from sqlalchemy import text

# Mirrors is_effective_outcome() in auto_tags.py, term for term:
#   split_part(outcome, ' - ', 1)  -> the machine half, split ONCE
#   btrim(...)                     -> the .strip() the Python does
#   <> ''                          -> an unreadable outcome reaches nobody
#   split_part(..., ':', 1)        -> the family
# Kept in lockstep with that function; test_customer_visit_dates.py pins the two
# against each other over every outcome value and every legacy shape.
_VISIT_DATES = text("""
SELECT MAX(COALESCE(te.end_time, ts.created_at)) AS last_stop,
       MAX(COALESCE(te.end_time, ts.created_at)) FILTER (
           WHERE btrim(split_part(ts.outcome, ' - ', 1)) <> ''
             AND split_part(btrim(split_part(ts.outcome, ' - ', 1)), ':', 1) <> 'skipped'
       ) AS last_effective_stop
FROM trip_stop ts
LEFT JOIN task_execution te ON te.uuid = ts.task_execution_uuid
WHERE ts.customer_uuid = :customer_uuid
  AND (te.status = 'completed' OR btrim(COALESCE(ts.outcome, '')) <> '')
""")


def recompute_visit_dates(uow, customer) -> None:
    """Reset the customer's two visit dates from their trip stops.

    Nothing is committed — the caller's unit of work owns the transaction, so
    the dates land with the stop completion that caused them. Must run AFTER the
    stop's outcome and its task execution's end_time have been saved, or the
    query reads the previous state of the very stop being completed.
    """
    if customer is None:
        return
    row = uow.session.execute(
        _VISIT_DATES, {"customer_uuid": customer.uuid}
    ).one()
    customer.last_stop = row.last_stop
    customer.last_effective_stop = row.last_effective_stop
    uow.customer_repository.save(model=customer, commit=False)
