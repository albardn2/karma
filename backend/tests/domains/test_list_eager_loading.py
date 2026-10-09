"""Every list route must keep eager-loading what its DTO serializes.

models/common.py declares 122 relationship() calls and not one sets `lazy=`,
so each hop a derived field walks is a separate query PER ROW. Measured
before these loaders were wired up, at ?per_page=20:

    /customer/ 145   /customer-order/ 136   /invoice/ 110
    /inventory/ 115  /purchase-order/ 49
    POST /customer/query (unpaginated) 1031

and after: 13, 14, 10, 52, 10, 12. Responses byte-identical across 33
probes.

WHAT THESE TESTS CAN AND CANNOT DO, because it bounds what they are worth.
The regression that matters is a statement COUNT, and this suite has no
real database — conftest hands out a DummySession, and the models use
PostGIS geometry columns so SQLite is not an option either. So these pin
the SHAPE of the loader sets and the WIRING, which is how it realistically
breaks: a property grows a hop and nobody adds the chain, or a refactor
drops the `options=` argument. The counts above are measurement, recorded
in the commit message, not assertions.

ONE TRAP WORTH KNOWING. test_trip_eager_loading.py walks `opt.path` to
read a chain's hops. That works for trip, whose chains are built in one
expression — but on a COMPOSED loader
(`selectinload(a).options(*SHARED)`), `.path` reports only the outermost
hop, so copying that helper here would give an exact-set assertion that
passes while the shared chain underneath is empty. These walk `.context`
instead.
"""
import pytest
from sqlalchemy.orm import selectinload

from app.adapters.repositories._serialization_loaders import (
    INVOICE_MONEY_LOADERS,
    PURCHASE_ORDER_ITEM_NOTE_LOADERS,
)
from app.adapters.repositories.customer_order_repository import (
    CUSTOMER_ORDER_SERIALIZATION_LOADERS,
)
from app.adapters.repositories.customer_repository import CUSTOMER_SERIALIZATION_LOADERS
from app.adapters.repositories.inventory_repository import (
    INVENTORY_SERIALIZATION_LOADERS,
)
from app.adapters.repositories.invoice_repository import INVOICE_SERIALIZATION_LOADERS
from app.adapters.repositories.purchase_order_repository import (
    PURCHASE_ORDER_SERIALIZATION_LOADERS,
)
from models.common import Customer

ALL_LOADER_SETS = {
    "customer": CUSTOMER_SERIALIZATION_LOADERS,
    "customer_order": CUSTOMER_ORDER_SERIALIZATION_LOADERS,
    "invoice": INVOICE_SERIALIZATION_LOADERS,
    "inventory": INVENTORY_SERIALIZATION_LOADERS,
    "purchase_order": PURCHASE_ORDER_SERIALIZATION_LOADERS,
    "_shared_invoice_money": INVOICE_MONEY_LOADERS,
    "_shared_po_item_notes": PURCHASE_ORDER_ITEM_NOTE_LOADERS,
}


def _hops(options):
    """Every (Model.attribute) hop reachable in these chains, composed ones
    included. Walks `.context`, not `.path` — see the module docstring."""
    out = set()
    for opt in options:
        for element in opt.context:
            path = element.path
            for i in range(0, len(path) - 1, 2):
                out.add(f"{path[i].class_.__name__}.{path[i + 1].key}")
    return out


@pytest.mark.parametrize("name", sorted(ALL_LOADER_SETS))
def test_every_loader_is_selectin_not_joined(name):
    """joinedload would emit a JOIN, so a parent with 15 children becomes 15
    duplicate rows and LIMIT 20 returns 20 ROWS rather than 20 records — the
    wrong page, with no error. Checked on every HOP: `selectinload(a).
    joinedload(b)` would pass a check that only looked at the outermost."""
    strategies = {
        strategy
        for opt in ALL_LOADER_SETS[name]
        for element in opt.context
        for strategy in (element.strategy or ())
    }
    assert strategies == {("lazy", "selectin")}, (name, strategies)


def test_the_shared_invoice_money_graph_is_what_three_routes_walk():
    """Shared by /invoice/, /customer-order/ and /customer/. Asserted
    exactly: a hop added to Invoice's money properties without a chain here
    silently returns all three pages to one query per row."""
    assert _hops(INVOICE_MONEY_LOADERS) == {
        "Invoice.payments",
        "Invoice.invoice_items",
        "InvoiceItem.customer_order_item",
        "InvoiceItem.debit_note_items",
        "DebitNoteItem.payments",
        "InvoiceItem.credit_note_items",
        "CreditNoteItem.payouts",
    }


def test_the_customer_chain_reaches_the_shared_invoice_graph():
    """The composition is the thing most likely to break silently: if
    `.options(*INVOICE_MONEY_LOADERS)` were dropped, the customer page would
    still eager-load orders and invoices and look fixed, while every invoice
    went back to fetching its own items, payments and notes."""
    hops = _hops(CUSTOMER_SERIALIZATION_LOADERS)
    assert {"Customer.orders", "CustomerOrder.invoices"} <= hops
    assert _hops(INVOICE_MONEY_LOADERS) <= hops, "shared invoice graph not composed in"
    assert {
        "Customer.debit_note_items", "DebitNoteItem.payments",
        "Customer.credit_note_items", "CreditNoteItem.payouts",
    } <= hops


def test_the_customer_order_and_invoice_routes_compose_the_same_graph():
    assert _hops(INVOICE_MONEY_LOADERS) <= _hops(CUSTOMER_ORDER_SERIALIZATION_LOADERS)
    assert _hops(INVOICE_MONEY_LOADERS) <= _hops(INVOICE_SERIALIZATION_LOADERS)


def test_purchase_order_and_inventory_share_the_note_legs():
    notes = _hops(PURCHASE_ORDER_ITEM_NOTE_LOADERS)
    assert notes == {
        "PurchaseOrderItem.debit_note_items",
        "PurchaseOrderItem.credit_note_items",
    }
    assert notes <= _hops(PURCHASE_ORDER_SERIALIZATION_LOADERS)
    assert notes <= _hops(INVENTORY_SERIALIZATION_LOADERS)


def test_the_unpaginated_customer_query_fetchers_eager_load_too():
    """POST /customer/query does NOT go through find_all_by_filters_paginated,
    so the list route's `options=` does nothing for it — and it is
    unpaginated, serializing every match. It was the single biggest offender
    on this endpoint family. The loaders go on the fetchers themselves."""
    import inspect

    from app.adapters.repositories import customer_repository as mod

    for fn in ("fetch_mappable_customers", "fetch_queryable_customers"):
        src = inspect.getsource(getattr(mod.CustomerRepository, fn))
        assert "CUSTOMER_SERIALIZATION_LOADERS" in src, fn

    # ...and NOT on the router's pools, which never build CustomerRead
    for fn in ("fetch_priority_routing_pool",):
        src = inspect.getsource(getattr(mod.CustomerRepository, fn))
        assert "CUSTOMER_SERIALIZATION_LOADERS" not in src, fn


def test_options_are_applied_to_the_page_query_and_never_to_the_count():
    """A loader option on a COUNT(*) makes the database fetch collections
    whose rows are then thrown away."""
    from unittest.mock import MagicMock

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
    repo._type = Customer
    repo._scope_filters = lambda f: f or []

    repo.find_all_by_filters_paginated(
        filters=[], page=1, per_page=20, options=[selectinload(Customer.orders)],
    )
    assert order == ["count", "options"], order
