"""Deleting a whole purchase order.

Both DELETE /purchase-order/<uuid> (the web app) and
DELETE /purchase-order/with-items/<uuid> (Expo) run
PurchaseOrderDomain.delete_purchase_order_with_items: refused once anything
has been paid out, or once a line has been received; otherwise the order
and its lines go together.

Built on real (unsaved) models so net_amount_paid / is_paid are the
production hybrid properties.
"""
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.domains.purchase_order.domain import PurchaseOrderDomain
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from models.common import Material, Payout, PurchaseOrder, PurchaseOrderItem, Vendor

CREATED = datetime(2026, 9, 1)


def _order(*lines, payouts=()):
    """One USD order; each line is (quantity, price_per_unit, is_fulfilled)."""
    po = PurchaseOrder(
        uuid="po-1", vendor_uuid="v-1", vendor=Vendor(uuid="v-1", company_name="Acme Seeds"),
        currency="USD", created_at=CREATED, is_deleted=False,
    )
    for n, (quantity, price, fulfilled) in enumerate(lines):
        PurchaseOrderItem(
            uuid=f"poi-{n}", purchase_order=po, purchase_order_uuid=po.uuid,
            material=Material(uuid="mat-1", name="raw peanuts"), material_uuid="mat-1",
            quantity=quantity, price_per_unit=price, currency="USD", unit="kg",
            is_fulfilled=fulfilled, fulfilled_at=CREATED if fulfilled else None,
            quantity_received=float(quantity) if fulfilled else 0.0,
            created_at=CREATED, is_deleted=False,
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


def test_an_unreceived_unpaid_order_goes_with_its_lines():
    po = _order((1000, 1.5, False), (500, 1.0, False))

    read = PurchaseOrderDomain.delete_purchase_order_with_items(uow=_uow(po), uuid="po-1")

    assert read.is_deleted is True
    assert all(item.is_deleted for item in po.purchase_order_items)


def test_an_order_with_a_payout_is_refused():
    po = _order((1000, 1.5, False), payouts=[200.0])

    with pytest.raises(BadRequestError, match="has payout"):
        PurchaseOrderDomain.delete_purchase_order_with_items(uow=_uow(po), uuid="po-1")

    assert po.is_deleted is False


def test_an_order_with_a_received_line_is_refused():
    po = _order((1000, 1.5, False), (500, 1.0, True))

    with pytest.raises(BadRequestError, match="already fulfilled"):
        PurchaseOrderDomain.delete_purchase_order_with_items(uow=_uow(po), uuid="po-1")

    assert po.is_deleted is False


def test_an_order_that_totals_nothing_is_not_paid():
    # free goods: nothing is due, so is_paid reads True, but nothing was paid out
    po = _order((20, 0.0, False))
    assert po.is_paid

    read = PurchaseOrderDomain.delete_purchase_order_with_items(uow=_uow(po), uuid="po-1")

    assert read.is_deleted is True


def test_an_unknown_order_is_not_found():
    uow = _uow(_order())
    uow.purchase_order_repository.find_one.return_value = None

    with pytest.raises(NotFoundError):
        PurchaseOrderDomain.delete_purchase_order_with_items(uow=uow, uuid="nope")
