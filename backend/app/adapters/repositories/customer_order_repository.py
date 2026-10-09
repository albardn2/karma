from sqlalchemy.orm import selectinload

from app.adapters.repositories._abstract_repo import AbstractRepository
from app.adapters.repositories._serialization_loaders import INVOICE_MONEY_LOADERS
from models.common import CustomerOrder, CustomerOrderItem


# Everything CustomerOrderRead's derived fields walk. Mirrors
# models/common.py exactly:
#
#   customer_company_name / customer_full_name
#       (dto/customer_order.py:54,58 — AliasPath)      -> customer
#   is_fulfilled (333) / fulfilled_at (354)            -> customer_order_items
#   CustomerOrderItemRead.material_name (dto:30 -> 501)
#                                      -> customer_order_items -> material
#   currency (324), is_paid (376), is_overdue (394),
#   total_adjusted_amount (413), net_amount_due (434),
#   net_amount_paid (453)              -> invoices, then the invoice money
#                                         graph
#
# InvoiceItem.customer_order_item (inside INVOICE_MONEY_LOADERS) costs nothing
# while the chain above it stands — the order's own items load first, so that
# many-to-one resolves out of the identity map. It is still needed: on main,
# stubbing is_fulfilled alone pushes the page UP by 19 queries, because the
# invoice branch then runs first and every InvoiceItem fetches its own line.
# One flat query beats a dependency on field declaration order.
CUSTOMER_ORDER_SERIALIZATION_LOADERS = [
    selectinload(CustomerOrder.customer),
    selectinload(CustomerOrder.customer_order_items).selectinload(
        CustomerOrderItem.material
    ),
    selectinload(CustomerOrder.invoices).options(*INVOICE_MONEY_LOADERS),
]


class CustomerOrderRepository(AbstractRepository[CustomerOrder]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = CustomerOrder
