"""Fulfilling a purchase order item must stock the warehouse — for everything
that IS stock.

The fulfillment handler used to map only RAW_MATERIAL to the inventory handler;
every other type fell through a silent `pass`: the item was flagged fulfilled,
the API said 200, and no inventory or inventory event existed. Worse, such an
item could never be UN-fulfilled — the undo insisted on finding exactly one PO
event. A distributor's catalog is mostly PRODUCT, so the happy path was the
broken one.

The rule now: RAW_MATERIAL / PRODUCT / PREPARED stock inventory on fulfillment.
MACHINERY_AND_EQUIPMENT and VEHICLE deliberately do not — those purchases
become fixed assets, not stock — and unfulfill treats "no event" as a valid
state rather than a corruption.
"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.domains.purchase_order_item.domain import PurchaseOrderItemDomain
from app.domains.purchase_order_item.fulfillment_handlers.fulfillment_handler_entrypoint import (
    PurchaseOrderItemFulfillmentHandler,
)
from app.domains.purchase_order_item.fulfillment_handlers.inventory_fulfillment_handler import (
    InventoryFulfillmentHandler,
)
from app.dto.inventory_event import InventoryEventType
from app.dto.material import MaterialType
from app.dto.purchase_order_item import POUnFulfillItem, PurchaseOrderItemBulkUnFulfill
from app.entrypoint.routes.common.errors import BadRequestError


def test_every_storable_material_type_stocks_inventory_on_fulfillment():
    mapper = PurchaseOrderItemFulfillmentHandler().material_category_mapper
    for storable in (MaterialType.RAW_MATERIAL, MaterialType.PRODUCT, MaterialType.PREPARED):
        assert mapper.get(storable) is InventoryFulfillmentHandler, storable
    # fixed-asset purchases are the deliberate exception
    for asset in (MaterialType.MACHINERY_AND_EQUIPMENT, MaterialType.VEHICLE):
        assert mapper.get(asset) is None, asset


def test_the_mapper_is_keyed_so_db_strings_resolve():
    """material.type off the model is a plain string; the mapper's enum keys
    only match because MaterialType subclasses str. Pin that assumption — an
    IntEnum refactor would silently turn every fulfillment into a no-op."""
    mapper = PurchaseOrderItemFulfillmentHandler().material_category_mapper
    assert mapper.get("product") is InventoryFulfillmentHandler


def _stuck_item(events):
    """A fulfilled item as unfulfill_items reads it."""
    return SimpleNamespace(
        uuid="poi-1",
        created_by_uuid=None,
        purchase_order_uuid="po-1",
        material_uuid="mat-1",
        quantity=5,
        price_per_unit=10.0,
        currency="USD",
        unit="kg",
        quantity_received=0.0,
        is_fulfilled=True,
        fulfilled_at=datetime(2026, 8, 1),
        created_at=datetime(2026, 7, 1),
        is_deleted=False,
        total_price=50.0,
        material_name="large coated peanuts",
        inventory_events=events,
    )


def _unfulfill(po_item):
    uow = MagicMock()
    uow.purchase_order_item_repository.find_one.return_value = po_item
    return PurchaseOrderItemDomain.unfulfill_items(
        uow=uow,
        payload=PurchaseOrderItemBulkUnFulfill(
            items=[POUnFulfillItem(purchase_order_item_uuid="poi-1")]
        ),
    )


def test_unfulfilling_an_item_that_never_stocked_inventory_clears_the_flags():
    """No event is a real state, not corruption — and tolerating it is the only
    way to unstick items fulfilled while the handler skipped their type."""
    po_item = _stuck_item(events=[])
    _unfulfill(po_item)
    assert po_item.is_fulfilled is False
    assert po_item.fulfilled_at is None


def test_unfulfilling_still_refuses_ambiguous_stock():
    """More than one PO event for one item has no single undo — refuse."""
    event = lambda: SimpleNamespace(  # noqa: E731
        uuid="ev", is_deleted=False,
        event_type=InventoryEventType.PURCHASE_ORDER.value,
        inventory_uuid="inv-1",
    )
    po_item = _stuck_item(events=[event(), event()])
    with pytest.raises(BadRequestError):
        _unfulfill(po_item)
    # refused atomically: the flags were reset in the loop, but nothing commits
    # (the route's unit of work rolls the request back on the raise)
