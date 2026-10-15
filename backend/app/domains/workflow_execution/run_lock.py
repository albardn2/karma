"""One writer at a time per workflow execution.

A trip run is written from two places at once as a matter of course: the
driver's app and the office's web page. Every write that reads the run's state
and then changes it — completing a step, adding a stop, setting the current
stop, re-sorting, cancelling, skip-and-finish — takes this row lock FIRST, so
they apply one after another and each reads what the one before committed.

Without it the reads go stale under READ COMMITTED: a stop added while the
trip is being finished lands, open, on a finished trip (and its customer is
then kept off every future strategy-built trip); a stop completed while it is
being cancelled ends up cancelled with a sale outcome.

Lock straight after the find_one, before touching anything else on the run:
what is loaded afterwards is read under the lock, and the refresh re-reads the
run itself. An object loaded BEFORE the lock keeps its stale state unless it is
refreshed too.
"""
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork


def lock_run(uow: SqlAlchemyUnitOfWork, workflow_execution) -> None:
    """SELECT … FOR UPDATE on the run's row, held until the unit of work ends.
    A second writer on the same run waits here, then reads the committed
    result of the first."""
    uow.session.refresh(workflow_execution, with_for_update=True)
