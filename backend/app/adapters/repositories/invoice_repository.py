from sqlalchemy.orm import selectinload

from app.adapters.repositories._abstract_repo import AbstractRepository
from app.adapters.repositories._serialization_loaders import INVOICE_MONEY_LOADERS
from models.common import CustomerOrderItem, Invoice, InvoiceItem


# The invoice money graph rooted directly, plus the one hop only this route
# needs: InvoiceRead nests InvoiceItemRead, whose material_name
# (dto/invoice_item.py:35 -> common.py:802) reads
# customer_order_item.material.name.
#
# InvoiceItemRead.currency (dto/invoice_item.py:38 -> common.py:778) is
# deliberately NOT loaded: it reads InvoiceItem.invoice, a many-to-one back to
# the parent that is already in the identity map. Measured — ablating it moves
# the statement count by zero.
INVOICE_SERIALIZATION_LOADERS = INVOICE_MONEY_LOADERS + [
    selectinload(Invoice.invoice_items)
    .selectinload(InvoiceItem.customer_order_item)
    .selectinload(CustomerOrderItem.material),
]


class InvoiceRepository(AbstractRepository[Invoice]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Invoice
