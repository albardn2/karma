"""What an invoice line is allowed to cost.

Zero is permitted on purpose — a sample, a promotional unit, a replacement for
damaged goods. The line still belongs on the invoice so the stock leaves the
books and the customer sees what they received.

Negative is refused on purpose. Money goes back to a customer through a credit
note, which is its own record with its own audit trail; a negative line item
would quietly subtract from an invoice total with nothing explaining why.

The constraint lives on InvoiceItem rather than on the customer-order DTO, so
this is also the gate for `POST /customer-order/with-items-and-invoice` — the
order path feeds its prices straight into InvoiceItemCreate.
"""
import pytest
from pydantic import ValidationError

from app.dto.invoice_item import InvoiceItemCreate

_IDS = dict(invoice_uuid="11111111-1111-4111-8111-111111111111",
            customer_order_item_uuid="22222222-2222-4222-8222-222222222222")


def test_free_line_is_allowed():
    item = InvoiceItemCreate(price_per_unit=0, **_IDS)
    assert item.price_per_unit == 0


def test_ordinary_price_is_allowed():
    assert InvoiceItemCreate(price_per_unit=133.875, **_IDS).price_per_unit == 133.875


@pytest.mark.parametrize("price", [-0.01, -1, -13387.5])
def test_negative_line_is_refused(price):
    with pytest.raises(ValidationError, match="greater than or equal to 0"):
        InvoiceItemCreate(price_per_unit=price, **_IDS)
