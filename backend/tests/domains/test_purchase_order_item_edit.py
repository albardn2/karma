"""Correcting a purchase order line's quantity or price after the fact.

PUT /purchase-order/<uuid> takes `purchase_order_items: [{uuid, quantity?,
price_per_unit?}]`. The price needs no bookkeeping beyond its column — a lot's
cost per unit is computed on read from its PO line — but the quantity is also
what fulfilment received, so the line's PURCHASE_ORDER inventory event is
edited in place to match.

Built on real (unsaved) models rather than SimpleNamespace, so the hybrid
properties that decide the outcome — adjusted_quantity, net_amount_due, a lot's
original/current quantity and cost — are the production ones.
"""
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.domains.inventory.domain import InventoryDomain
from app.domains.purchase_order.domain import PurchaseOrderDomain
from app.dto.common_enums import Currency
from app.dto.inventory_event import InventoryEventType
from app.dto.purchase_order import PurchaseOrderUpdate
from app.dto.purchase_order_item import PurchaseOrderItemEdit
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from models.common import (
    CreditNoteItem,
    FixedAsset,
    Inventory,
    InventoryEvent,
    Material,
    Payout,
    PurchaseOrder,
    PurchaseOrderItem,
    Vendor,
)

CREATED = datetime(2026, 9, 1)


def _event(lot, quantity, event_type, affect_original, po_item=None, uuid="ev", cost_per_unit=None, currency=None):
    return InventoryEvent(
        uuid=uuid, inventory=lot, inventory_uuid=lot.uuid,
        purchase_order_item=po_item, purchase_order_item_uuid=po_item.uuid if po_item else None,
        event_type=event_type.value, quantity=quantity, affect_original=affect_original,
        material_uuid="mat-1", cost_per_unit=cost_per_unit, currency=currency,
        is_deleted=False, created_at=CREATED,
    )


def _order(quantity=1000, price=1.5, fulfilled=True, receipts=1):
    """One USD order with one line, fulfilled into its own lot."""
    po = PurchaseOrder(
        uuid="po-1", vendor_uuid="v-1", vendor=Vendor(uuid="v-1", company_name="Acme Seeds"),
        currency="USD", created_at=CREATED, is_deleted=False,
    )
    item = PurchaseOrderItem(
        uuid="poi-1", purchase_order=po, purchase_order_uuid=po.uuid,
        material=Material(uuid="mat-1", name="raw peanuts"), material_uuid="mat-1",
        quantity=quantity, price_per_unit=price, currency="USD", unit="kg",
        is_fulfilled=fulfilled, fulfilled_at=CREATED if fulfilled else None,
        quantity_received=float(quantity) if fulfilled else 0.0,
        created_at=CREATED, is_deleted=False,
    )
    lot = Inventory(uuid="inv-1", material_uuid="mat-1", warehouse_uuid="wh-1",
                    unit="kg", lot_id="lot-1", is_deleted=False)
    for n in range(receipts if fulfilled else 0):
        _event(lot, quantity, InventoryEventType.PURCHASE_ORDER, True, po_item=item, uuid=f"receipt-{n}")
    return po, item, lot


def _uow(po=None, lot=None, fixed_assets=()):
    uow = MagicMock()
    uow.purchase_order_repository.find_one.return_value = po
    uow.inventory_repository.find_one.return_value = lot
    uow.fixed_asset_repository.find_all.return_value = list(fixed_assets)
    return uow


def _edit(po, uow=None, **fields):
    return PurchaseOrderDomain.update_purchase_order(
        uow=uow or _uow(po), uuid=po.uuid,
        payload=PurchaseOrderUpdate(purchase_order_items=[{"uuid": "poi-1", **fields}]),
    )


def _lot_cost(lot):
    return InventoryDomain._lot_cost_and_quantity(
        uow=_uow(lot=lot), inventory_uuid=lot.uuid,
        ctx=InventoryDomain.new_cost_context(currency=Currency.USD),
    )


# --- quantity ---------------------------------------------------------------

def test_a_quantity_edit_moves_the_receipt_event_in_place():
    po, item, lot = _order(quantity=1000)
    receipt = item.inventory_events[0]
    uow = _uow(po)

    _edit(po, uow=uow, quantity=950)

    assert item.quantity == 950
    assert item.quantity_received == 950
    assert receipt.quantity == 950
    uow.inventory_event_repository.save.assert_called_with(model=receipt, commit=False)
    # edited, not compensated: still exactly one event, which unfulfill and the
    # credit/debit notes depend on
    assert item.inventory_events == [receipt]
    assert lot.original_quantity == 950
    assert lot.current_quantity == 950


def test_a_quantity_cut_below_what_was_sold_takes_the_lot_negative():
    """Same tolerance as an oversale: the correction records what physically
    arrived, and refusing it would keep the vendor's bill wrong too."""
    po, item, lot = _order(quantity=1000)
    _event(lot, -980, InventoryEventType.SALE, False, uuid="sale")

    _edit(po, quantity=950)

    assert lot.current_quantity == -30


def test_an_unfulfilled_line_only_changes_its_own_figures():
    po, item, _ = _order(fulfilled=False)

    _edit(po, quantity=1200, price_per_unit=1.4)

    assert (item.quantity, item.price_per_unit) == (1200, 1.4)
    assert item.quantity_received == 0.0
    assert item.inventory_events == []


def test_a_fulfilled_line_that_stocked_nothing_still_records_what_it_received():
    """Machinery and vehicles become fixed assets, not stock: no receipt event."""
    po, item, _ = _order(quantity=2, receipts=0)

    _edit(po, quantity=3)

    assert item.quantity_received == 3


def test_ambiguous_receipts_are_refused():
    po, _, _ = _order(receipts=2)
    with pytest.raises(BadRequestError, match="PO inventory event count"):
        _edit(po, quantity=900)


# --- price ------------------------------------------------------------------

def test_a_price_edit_recosts_the_lot_without_touching_its_events():
    po, item, lot = _order(quantity=1000, price=1.5)
    receipt = item.inventory_events[0]
    assert _lot_cost(lot) == (pytest.approx(1.5), 1000)

    _edit(po, price_per_unit=1.25)

    # the receipt carries no cost of its own — it is priced from the line
    assert receipt.cost_per_unit is None
    assert receipt.quantity == 1000
    assert _lot_cost(lot) == (pytest.approx(1.25), 1000)


def test_a_shared_lot_reaverages_after_both_figures_change():
    """Fulfilment can top up an existing lot, so the line is one receipt of
    several and the edit moves the weighted average, not the whole cost."""
    po, item, lot = _order(quantity=1000, price=1.5)
    _event(lot, 1000, InventoryEventType.MANUAL, True, uuid="opening", cost_per_unit=2.0, currency="USD")
    assert _lot_cost(lot) == (pytest.approx(1.75), 2000)

    _edit(po, quantity=500, price_per_unit=1.0)

    # (500 × 1.0 + 1000 × 2.0) / 1500
    assert _lot_cost(lot) == (pytest.approx(2500 / 1500), 1500)


# --- what the notes and payouts already committed --------------------------

def test_quantity_cannot_drop_below_what_credit_notes_returned():
    po, item, _ = _order(quantity=1000)
    CreditNoteItem(uuid="cn-1", purchase_order_item=item, amount=150.0,
                   inventory_change=-100, currency="USD", is_deleted=False)
    with pytest.raises(BadRequestError, match="below 100"):
        _edit(po, quantity=90)

    po, item, _ = _order(quantity=1000)
    CreditNoteItem(uuid="cn-1", purchase_order_item=item, amount=150.0,
                   inventory_change=-100, currency="USD", is_deleted=False)
    _edit(po, quantity=100)
    assert item.adjusted_quantity == 0


def test_a_money_only_note_moves_no_stock():
    """inventory_change is NULL on a note that only moves money. The in-Python
    adjusted_quantity used to add that None and raise TypeError — which also
    500'd every cost read of the lot the line stocked."""
    po, item, lot = _order(quantity=1000, price=1.5)
    CreditNoteItem(uuid="cn-1", purchase_order_item=item, amount=100.0,
                   currency="USD", is_deleted=False)

    _edit(po, quantity=800)

    assert item.adjusted_quantity == 800
    # (800 × 1.5 − 100) / 800
    assert _lot_cost(lot) == (pytest.approx(1100 / 800), 800)


def test_credit_notes_cannot_end_up_worth_more_than_the_line():
    po, item, _ = _order(quantity=1000, price=1.5)
    CreditNoteItem(uuid="cn-1", purchase_order_item=item, amount=600.0,
                   currency="USD", is_deleted=False)
    with pytest.raises(BadRequestError, match="credit/debit notes already take off"):
        _edit(po, price_per_unit=0.5)


def test_the_order_cannot_drop_below_what_was_paid_out():
    po, _, _ = _order(quantity=1000, price=1.5)
    Payout(uuid="pay-1", purchase_order=po, amount=1500.0, currency="USD", is_deleted=False)
    with pytest.raises(BadRequestError, match="already paid out"):
        _edit(po, price_per_unit=1.4)

    po, _, _ = _order(quantity=1000, price=1.5)
    Payout(uuid="pay-1", purchase_order=po, amount=1500.0, currency="USD", is_deleted=False)
    read = _edit(po, price_per_unit=1.6)
    assert read.net_amount_due == pytest.approx(100)
    assert read.status == "pending"


def test_an_overpaid_order_can_still_be_corrected_towards_its_payouts():
    po, _, _ = _order(quantity=1000, price=1.5)
    Payout(uuid="pay-1", purchase_order=po, amount=1600.0, currency="USD", is_deleted=False)

    read = _edit(po, price_per_unit=1.55)

    assert read.net_amount_due == pytest.approx(-50)


# --- fixed assets -----------------------------------------------------------

def test_a_fixed_asset_follows_the_line_unless_edited_by_hand():
    po, _, _ = _order(quantity=2, price=5000.0, receipts=0)
    copied = FixedAsset(uuid="fa-1", quantity=2.0, price_per_unit=5000.0, is_deleted=False)
    repriced_by_hand = FixedAsset(uuid="fa-2", quantity=2.0, price_per_unit=4800.0, is_deleted=False)

    _edit(po, uow=_uow(po, fixed_assets=[copied, repriced_by_hand]), quantity=3, price_per_unit=5200.0)

    assert (copied.quantity, copied.price_per_unit) == (3, 5200.0)
    assert (repriced_by_hand.quantity, repriced_by_hand.price_per_unit) == (3, 4800.0)


# --- the request ------------------------------------------------------------

def test_notes_and_due_date_still_update_alongside_the_lines():
    po, item, _ = _order()
    due = datetime(2026, 11, 1)

    PurchaseOrderDomain.update_purchase_order(
        uow=_uow(po), uuid=po.uuid,
        payload=PurchaseOrderUpdate(notes="short delivery", payout_due_date=due,
                                    purchase_order_items=[{"uuid": "poi-1", "quantity": 900}]),
    )

    assert (po.notes, po.payout_due_date, item.quantity) == ("short delivery", due, 900)


def test_lines_left_out_are_untouched():
    po, item, _ = _order(quantity=1000, price=1.5)

    PurchaseOrderDomain.update_purchase_order(
        uow=_uow(po), uuid=po.uuid, payload=PurchaseOrderUpdate(notes="n"))

    assert (item.quantity, item.price_per_unit) == (1000, 1.5)


@pytest.mark.parametrize("make_foreign", [
    lambda item: setattr(item, "uuid", "poi-elsewhere"),  # not on this order
    lambda item: setattr(item, "is_deleted", True),
])
def test_a_line_not_live_on_this_order_is_refused(make_foreign):
    po, item, _ = _order()
    make_foreign(item)
    with pytest.raises(NotFoundError):
        _edit(po, quantity=900)


def test_a_line_edited_twice_in_one_request_is_refused():
    po, _, _ = _order()
    with pytest.raises(BadRequestError, match="once per request"):
        PurchaseOrderDomain.update_purchase_order(
            uow=_uow(po), uuid=po.uuid,
            payload=PurchaseOrderUpdate(purchase_order_items=[
                {"uuid": "poi-1", "quantity": 900}, {"uuid": "poi-1", "quantity": 800}]),
        )


def test_the_payload_only_carries_correctable_figures():
    PurchaseOrderItemEdit(uuid="poi-1", price_per_unit=0)  # free goods are a real price
    for bad in ({"material_uuid": "mat-2"}, {"currency": "SYP"}, {"quantity": 0}, {"price_per_unit": -1}):
        with pytest.raises(ValidationError):
            PurchaseOrderItemEdit(uuid="poi-1", **bad)
    # the order's own commercial terms stay fixed
    with pytest.raises(ValidationError):
        PurchaseOrderUpdate(vendor_uuid="v-2")
