"""The trip list and summary must keep eager-loading what they serialize.

TripRead's derived cash/stock figures walk stops -> payments and
stops -> vehicle_inventory_events while a trip is serialized. None of the
122 relationships in models/common.py sets `lazy=`, so without loader
options every one of those hops is a separate query PER ROW: measured
before this was wired up, GET /trip/?per_page=20 ran 176 statements and
/trip/summary over 20 trips ran 304. With the options they run 17 and 15.

WHAT THESE TESTS CAN AND CANNOT DO. The regression that matters is a
statement COUNT, and this suite has no real database — conftest hands out
a DummySession, and the models use PostGIS geometry columns so SQLite is
not an option either. So these pin the WIRING, which is the realistic way
it breaks: somebody refactors a call site and drops the `options=`
argument, and nothing anywhere complains while the page quietly goes back
to hundreds of queries.

The statement counts themselves were verified by measurement against a
real database, recorded in the commit message, with byte-identical
response bodies across twelve URLs.
"""
from unittest.mock import MagicMock

from sqlalchemy.orm import selectinload

from app.adapters.repositories.trip_repository import TRIP_SERIALIZATION_LOADERS
from models.common import (
    CustomerOrderItem,
    Expense,
    Invoice,
    Payment,
    Trip,
    TripStop,
    VehicleInventoryEvent,
)


def _paths(options):
    """Each loader chain as a tuple of (Model, attribute) hops."""
    out = []
    for opt in options:
        hops = []
        for el in opt.path:
            # a loader path alternates mapper, relationship-property
            if hasattr(el, "class_"):
                hops.append(el.class_.__name__)
            else:
                hops.append(el.key)
        # pair them up: Model.attr
        out.append(tuple(
            f"{hops[i]}.{hops[i + 1]}" for i in range(0, len(hops) - 1, 2)
        ))
    return set(out)


def test_the_loaders_cover_exactly_what_the_derived_fields_walk():
    """Mirrors models/common.py. If one of those properties grows a hop and
    this is not updated, the page silently returns to one query per row —
    so the set is asserted exactly rather than as a subset."""
    assert _paths(TRIP_SERIALIZATION_LOADERS) == {
        # vehicle_plate (dto/trip.py AliasPath)
        ("Trip.vehicle",),
        # trip_expenses / _paid / _unpaid -> Expense.amount_paid -> payouts
        ("Trip.expenses", "Expense.payouts"),
        # expected_cash (common.py:2200)
        ("Trip.stops", "TripStop.payments", "Payment.invoice", "Invoice.customer_order"),
        # inventory_reconciliation -> sold_inventory_map (common.py:2294)
        ("Trip.stops", "TripStop.vehicle_inventory_events",
         "VehicleInventoryEvent.customer_order_item", "CustomerOrderItem.customer_order"),
    }


def test_every_loader_is_selectin_not_joined():
    """joinedload would emit a JOIN, so a trip with 15 stops becomes 15
    duplicate rows and LIMIT 20 returns 20 ROWS rather than 20 trips — the
    wrong page, with no error. selectinload issues a second
    `WHERE parent IN (...)` query instead and leaves pagination intact.

    Asserted on every HOP, not just the outermost: `selectinload(a).
    joinedload(b)` would pass a check that only looked at the first.
    """
    strategies = {
        strategy
        for opt in TRIP_SERIALIZATION_LOADERS
        for element in opt.context
        for strategy in (element.strategy or ())
    }
    assert strategies == {("lazy", "selectin")}, strategies


def test_the_summary_passes_the_loaders():
    """/trip/summary rolls up the SAME per-trip properties and reaches
    deeper into them — measured at ~15 queries per trip, so the 100-trip
    cap was ~1,500 round trips in one request. Unlike the list, the summary
    genuinely needs these figures, so eager loading is its only fix."""
    from app.domains.trip.domain import TripDomain

    uow = MagicMock()
    page = MagicMock()
    page.items = []
    uow.trip_repository.find_all_by_filters_paginated.return_value = page

    TripDomain.summarize(uow=uow, trip_uuids=["some-uuid"])

    kwargs = uow.trip_repository.find_all_by_filters_paginated.call_args.kwargs
    assert kwargs.get("options") is TRIP_SERIALIZATION_LOADERS


def test_options_are_applied_to_the_page_query_and_never_to_the_count():
    """A loader option on a COUNT(*) makes the database fetch collections
    whose rows are then thrown away."""
    from app.adapters.repositories._abstract_repo import AbstractRepository

    order = []
    q = MagicMock()
    q.filter.return_value = q
    q.order_by.return_value = q
    q.count.side_effect = lambda: (order.append("count"), 0)[1]
    q.options.side_effect = lambda *a: (order.append("options"), q)[1]
    q.offset.return_value = q
    q.limit.return_value = q
    q.all.return_value = []

    repo = AbstractRepository.__new__(AbstractRepository)
    repo._session = MagicMock()
    repo._session.query.return_value = q
    repo._type = Trip
    repo._scope_filters = lambda f: f or []

    repo.find_all_by_filters_paginated(
        filters=[], page=1, per_page=20, options=[selectinload(Trip.stops)],
    )

    assert order == ["count", "options"], order
