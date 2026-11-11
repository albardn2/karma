"""Deleting a whole customer order (DELETE /customer-order/with-items-and-invoice/<uuid>).

Refused once anything has been handed over or received; otherwise the order,
its live lines and its live invoice go together. Judged on what is live: a
line deleted on its own earlier is already gone and is not deleted again, and
`is_fulfilled` / `is_paid` — vacuously true for an order with no lines or a
0.00 invoice — do not on their own block the delete.

Built on real (unsaved) models so net_amount_paid is the production hybrid.
"""
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.domains.customer_order.domain import CustomerOrderDomain
from app.dto.customer_order import CustomerOrderAndInvoiceItemCreate
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import CustomerOrder, CustomerOrderItem, Invoice, InvoiceItem, Material, Payment

CREATED = datetime(2026, 10, 1)


def _order(*lines, payments=()):
    """One SYP order with one invoice; each line is (price, is_fulfilled, is_deleted)."""
    order = CustomerOrder(uuid="co-1", customer_uuid="c-1", created_at=CREATED, is_deleted=False)
    invoice = Invoice(
        uuid="inv-1", customer_order=order, customer_order_uuid="co-1", customer_uuid="c-1",
        currency="SYP", created_at=CREATED, is_deleted=False,
    )
    material = Material(uuid="mat-1", name="Roasted peanuts 1kg")
    for n, (price, fulfilled, deleted) in enumerate(lines):
        coi = CustomerOrderItem(
            uuid=f"coi-{n}", customer_order=order, customer_order_uuid="co-1",
            material=material, material_uuid="mat-1", quantity=3, unit="kg",
            is_fulfilled=fulfilled, fulfilled_at=CREATED if fulfilled else None,
            created_at=CREATED, is_deleted=deleted,
        )
        InvoiceItem(
            uuid=f"ii-{n}", invoice=invoice, invoice_uuid="inv-1", customer_order_item=coi,
            customer_order_item_uuid=coi.uuid, price_per_unit=price, unit="kg",
            created_at=CREATED, is_deleted=deleted,
        )
    for n, amount in enumerate(payments):
        Payment(
            uuid=f"pay-{n}", invoice=invoice, amount=amount, currency="SYP",
            payment_method="cash", financial_account_uuid="fa-1", created_at=CREATED,
            is_deleted=False,
        )
    return order


def _live(rows, uuid):
    return next((r for r in rows if r.uuid == uuid and not r.is_deleted), None)


def _uow(order):
    """Repositories answer the way the real ones do: live rows only."""
    invoice = order.invoices[0]
    uow = MagicMock()
    uow.customer_order_repository.find_one.return_value = order
    uow.customer_order_item_repository.find_one.side_effect = (
        lambda uuid, is_deleted: _live(order.customer_order_items, uuid)
    )
    uow.invoice_item_repository.find_one.side_effect = (
        lambda uuid, is_deleted: _live(invoice.invoice_items, uuid)
    )
    uow.invoice_repository.find_one.side_effect = lambda uuid, is_deleted: _live(order.invoices, uuid)
    return uow


@pytest.fixture(autouse=True)
def _no_read_or_retag(monkeypatch):
    # the read model and the customer re-tag are not what is under test
    from app.dto import customer_order as dto

    monkeypatch.setattr(
        dto.CustomerOrderWithItemsAndInvoiceRead, "from_customer_order_model",
        classmethod(lambda cls, order: order),
    )
    monkeypatch.setattr(CustomerOrderDomain, "_retag_customer_after_void", staticmethod(lambda **_: None))


def _delete(order):
    return CustomerOrderDomain.delete_customer_order_with_items_and_invoice(uuid="co-1", uow=_uow(order))


def test_an_unfulfilled_unpaid_order_goes_with_its_lines_and_invoice():
    order = _order((100, False, False), (50, False, False))

    _delete(order)

    assert order.is_deleted is True
    assert all(i.is_deleted for i in order.customer_order_items)
    assert all(i.is_deleted for i in order.invoices[0].invoice_items)
    assert order.invoices[0].is_deleted is True


def test_a_line_deleted_earlier_does_not_fail_the_delete():
    """It used to be passed to delete_items again -> "CustomerOrderItem not found"."""
    order = _order((100, False, False), (50, False, True))

    _delete(order)

    assert order.is_deleted is True
    assert order.invoices[0].is_deleted is True


def test_an_order_whose_lines_were_all_deleted_can_still_go():
    """No live lines reads as `is_fulfilled` (vacuously) — nothing was handed over."""
    order = _order((100, False, True))

    _delete(order)

    assert order.is_deleted is True


def test_a_zero_priced_order_can_go():
    """A 0.00 invoice reads as `is_paid` — nothing was received."""
    order = _order((0, False, False))

    _delete(order)

    assert order.is_deleted is True


def test_an_order_with_a_fulfilled_line_is_refused():
    order = _order((100, True, False), (50, False, False))

    with pytest.raises(BadRequestError, match="fulfilled items"):
        _delete(order)

    assert order.is_deleted is False
    assert not any(i.is_deleted for i in order.customer_order_items)


def test_an_order_with_a_part_payment_is_refused():
    order = _order((100, False, False), payments=[40.0])

    with pytest.raises(BadRequestError, match="paid invoices"):
        _delete(order)

    assert order.is_deleted is False


# --- checkout lines are bounded at the request -------------------------------

def test_checkout_line_rejects_a_zero_or_negative_quantity():
    for quantity in (0, -3):
        with pytest.raises(ValueError):
            CustomerOrderAndInvoiceItemCreate(material_uuid="m", quantity=quantity, price_per_unit=1)


def test_checkout_line_rejects_a_quantity_the_column_cannot_hold():
    with pytest.raises(ValueError):
        CustomerOrderAndInvoiceItemCreate(material_uuid="m", quantity=10_000_000_000, price_per_unit=1)


def test_checkout_line_rejects_a_negative_price_but_allows_free():
    with pytest.raises(ValueError):
        CustomerOrderAndInvoiceItemCreate(material_uuid="m", quantity=1, price_per_unit=-0.5)
    assert CustomerOrderAndInvoiceItemCreate(material_uuid="m", quantity=1, price_per_unit=0).price_per_unit == 0


def test_a_line_deleted_on_its_own_leaves_its_invoice_line_and_still_goes():
    """/customer-order-item/bulk-delete removes the line but not its invoice line."""
    order = _order((100, False, False), (50, False, False))
    order.customer_order_items[1].is_deleted = True  # the invoice line stays live

    _delete(order)

    assert order.is_deleted is True
    assert all(li.is_deleted for li in order.invoices[0].invoice_items)


def test_money_on_an_invoice_deleted_on_its_own_still_blocks_the_delete():
    """A debit-note payment is not in invoice.payments, but it is money received:
    an invoice deleted by itself can still carry it, and deleting the order then
    would leave that payment counted against nothing."""
    from models.common import DebitNoteItem

    order = _order((100, False, False))
    invoice = order.invoices[0]
    dni = DebitNoteItem(uuid="dni-1", invoice_item=invoice.invoice_items[0], is_deleted=False)
    Payment(
        uuid="pay-dn", debit_note_item=dni, amount=50.0, currency="SYP",
        payment_method="cash", financial_account_uuid="fa-1", created_at=CREATED,
        is_deleted=False,
    )
    invoice.is_deleted = True

    with pytest.raises(BadRequestError, match="paid invoices"):
        _delete(order)

    assert order.is_deleted is False


def test_can_delete_agrees_with_the_delete():
    deletable = _order((100, False, False))
    fulfilled = _order((100, True, False))
    paid = _order((100, False, False), payments=[40.0])
    assert CustomerOrderDomain.can_delete_customer_order(deletable) is True
    assert CustomerOrderDomain.can_delete_customer_order(fulfilled) is False
    assert CustomerOrderDomain.can_delete_customer_order(paid) is False


def test_can_delete_sees_a_refund_the_net_amount_hides():
    """Paid 40, refunded 40 through a credit-note payout: net 0, but the payment
    row is live and the server refuses — the flag must say so."""
    from models.common import CreditNoteItem, Payout

    order = _order((100, False, False), payments=[40.0])
    cni = CreditNoteItem(uuid="cni-1", invoice_item=order.invoices[0].invoice_items[0], is_deleted=False)
    Payout(uuid="po-1", credit_note_item=cni, amount=40.0, currency="SYP", is_deleted=False)
    assert abs(order.invoices[0].net_amount_paid) < 0.005

    assert CustomerOrderDomain.can_delete_customer_order(order) is False


def test_can_delete_refuses_a_line_with_stock_events():
    from models.common import InventoryEvent

    order = _order((100, False, False))
    InventoryEvent(uuid="ie-1", customer_order_item=order.customer_order_items[0], is_deleted=False)

    assert CustomerOrderDomain.can_delete_customer_order(order) is False
