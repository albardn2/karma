"""Removing one line from a purchase order.

DELETE /purchase-order-item/<uuid> goes through PurchaseOrderItemDomain.delete_item.
A line that has moved stock or money (received, noted, stocked, turned into a
fixed asset) is refused. So is a removal that leaves the order paid out past
its total, because payouts cannot be edited.

Built on real (unsaved) models so net_amount_due is the production hybrid
property, not a stand-in.
"""
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.domains.purchase_order.domain import PurchaseOrderDomain
from app.domains.purchase_order_item.domain import PurchaseOrderItemDomain
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from models.common import (
    CreditNoteItem,
    DebitNoteItem,
    FixedAsset,
    InventoryEvent,
    Material,
    Payout,
    PurchaseOrder,
    PurchaseOrderItem,
    Vendor,
)

CREATED = datetime(2026, 9, 1)


def _order(*lines, payouts=()):
    """One USD order; each line is (quantity, price_per_unit)."""
    po = PurchaseOrder(
        uuid="po-1", vendor_uuid="v-1", vendor=Vendor(uuid="v-1", company_name="Acme Seeds"),
        currency="USD", created_at=CREATED, is_deleted=False,
    )
    for n, (quantity, price) in enumerate(lines):
        PurchaseOrderItem(
            uuid=f"poi-{n}", purchase_order=po, purchase_order_uuid=po.uuid,
            material=Material(uuid="mat-1", name="raw peanuts"), material_uuid="mat-1",
            quantity=quantity, price_per_unit=price, currency="USD", unit="kg",
            is_fulfilled=False, quantity_received=0.0, created_at=CREATED, is_deleted=False,
        )
    for n, amount in enumerate(payouts):
        Payout(uuid=f"pay-{n}", purchase_order=po, amount=amount, currency="USD", is_deleted=False)
    return po


def _uow(po):
    """Repositories answer the way the real ones do: live rows only."""
    uow = MagicMock()
    uow.purchase_order_repository.find_one.return_value = po
    uow.purchase_order_item_repository.find_one.side_effect = lambda uuid, is_deleted: next(
        (item for item in po.purchase_order_items if item.uuid == uuid and not item.is_deleted), None
    )
    for repo in ("credit_note_item", "debit_note_item", "inventory_event", "fixed_asset"):
        getattr(uow, f"{repo}_repository").find_all.return_value = []
    uow.payout_repository.find_all.return_value = [p for p in po.payouts if not p.is_deleted]
    return uow


def _line(po, uuid):
    return next(item for item in po.purchase_order_items if item.uuid == uuid)


def test_an_unreceived_line_is_soft_deleted():
    po = _order((1000, 1.5), (500, 1.0))
    uow = _uow(po)

    read = PurchaseOrderItemDomain.delete_item(uow=uow, uuid="poi-1")

    assert read.is_deleted is True
    assert _line(po, "poi-1").is_deleted is True
    assert _line(po, "poi-0").is_deleted is False
    assert po.total_amount == pytest.approx(1500)
    uow.purchase_order_item_repository.save.assert_called_once_with(model=_line(po, "poi-1"), commit=False)


def test_a_line_already_deleted_is_not_found():
    po = _order((1000, 1.5))
    _line(po, "poi-0").is_deleted = True

    with pytest.raises(NotFoundError):
        PurchaseOrderItemDomain.delete_item(uow=_uow(po), uuid="poi-0")


def test_a_received_line_is_refused():
    po = _order((1000, 1.5))
    _line(po, "poi-0").is_fulfilled = True
    uow = _uow(po)

    with pytest.raises(BadRequestError, match="already fulfilled"):
        PurchaseOrderItemDomain.delete_item(uow=uow, uuid="poi-0")

    assert _line(po, "poi-0").is_deleted is False
    uow.purchase_order_item_repository.save.assert_not_called()


@pytest.mark.parametrize("repo, row, message", [
    ("credit_note_item", CreditNoteItem(uuid="cn-1", amount=10.0, is_deleted=False), "credit notes"),
    ("debit_note_item", DebitNoteItem(uuid="dn-1", amount=10.0, is_deleted=False), "debit notes"),
    ("inventory_event", InventoryEvent(uuid="ev-1", quantity=1000, is_deleted=False), "inventory events"),
    ("fixed_asset", FixedAsset(uuid="fa-1", quantity=1.0, is_deleted=False), "fixed assets"),
])
def test_a_line_with_anything_hanging_off_it_is_refused(repo, row, message):
    po = _order((1000, 1.5))
    uow = _uow(po)
    getattr(uow, f"{repo}_repository").find_all.return_value = [row]

    with pytest.raises(BadRequestError, match=message):
        PurchaseOrderItemDomain.delete_item(uow=uow, uuid="poi-0")

    uow.purchase_order_item_repository.save.assert_not_called()


# --- payouts ----------------------------------------------------------------

def test_a_line_cannot_take_the_order_below_what_was_paid_out():
    po = _order((1000, 1.5), (500, 1.0), payouts=[1800.0])
    uow = _uow(po)

    with pytest.raises(BadRequestError, match="already paid out"):
        PurchaseOrderItemDomain.delete_item(uow=uow, uuid="poi-1")

    uow.purchase_order_item_repository.save.assert_not_called()


def test_a_line_can_go_while_the_payouts_still_fit():
    po = _order((1000, 1.5), (500, 1.0), payouts=[1500.0])

    PurchaseOrderItemDomain.delete_item(uow=_uow(po), uuid="poi-1")

    assert po.net_amount_due == pytest.approx(0)
    assert po.status == "paid"


def test_rounding_dust_is_not_an_overpayment():
    po = _order((1000, 1.5), (500, 1.0), payouts=[1500.004])

    PurchaseOrderItemDomain.delete_item(uow=_uow(po), uuid="poi-1")

    assert po.net_amount_due == pytest.approx(-0.004)


def test_an_overpaid_order_keeps_its_priced_lines_but_not_its_free_ones():
    po = _order((1000, 1.5), (500, 1.0), (20, 0.0), payouts=[2100.0])
    with pytest.raises(BadRequestError, match="already paid out"):
        PurchaseOrderItemDomain.delete_item(uow=_uow(po), uuid="poi-1")

    po = _order((1000, 1.5), (500, 1.0), (20, 0.0), payouts=[2100.0])
    read = PurchaseOrderItemDomain.delete_item(uow=_uow(po), uuid="poi-2")

    assert read.is_deleted is True
    assert po.net_amount_due == pytest.approx(-100)


# --- deleting the whole order ---------------------------------------------------

def test_the_order_can_still_go_after_one_of_its_lines_did():
    po = _order((1000, 1.5), (500, 1.0))
    uow = _uow(po)
    PurchaseOrderItemDomain.delete_item(uow=uow, uuid="poi-1")

    read = PurchaseOrderDomain.delete_purchase_order_with_items(uow=uow, uuid="po-1")

    assert read.is_deleted is True
    assert all(item.is_deleted for item in po.purchase_order_items)
