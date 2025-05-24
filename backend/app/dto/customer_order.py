# app/dto/customer_order.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

from app.dto.customer_order_item import CustomerOrderItemCreate
from app.dto.invoice import InvoiceCreate
from app.dto.invoice_item import InvoiceItemCreate
from app.dto.common_enums import UnitOfMeasure
from app.dto.common_enums import Currency
from app.dto.customer_order_item import CustomerOrderItemBulkCreate
from app.dto.invoice_item import InvoiceItemBulkCreate
from app.dto.customer_order_item import CustomerOrderItemBulkRead
from app.dto.invoice import InvoiceRead
from app.dto.invoice_item import InvoiceItemBulkRead
from app.dto.customer_order_item import CustomerOrderItemRead
from models.common import CustomerOrder
from app.dto.invoice_item import InvoiceItemRead


class CustomerOrderBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_uuid: str
    notes: Optional[str] = None

class CustomerOrderCreate(CustomerOrderBase):
    """Fields required to create a new customer order."""
    model_config = ConfigDict(extra="forbid")
class CustomerOrderUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None

class CustomerOrderRead(CustomerOrderBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_fulfilled: bool
    fulfilled_at: Optional[datetime]
    is_deleted: bool
    total_adjusted_amount: float
    is_overdue: bool
    customer_order_items: Optional[List[CustomerOrderItemRead]] = None
    net_amount_due: Optional[float] = None
    net_amount_paid: Optional[float] = None
    is_paid: Optional[bool] = None

class CustomerOrderListParams(BaseModel):
    """Optional filters plus pagination for listing orders."""
    model_config = ConfigDict(extra="forbid")
    customer_uuid: Optional[str] = None
    is_paid: Optional[bool] = None
    is_fulfilled: Optional[bool] = None
    is_overdue: Optional[bool] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class CustomerOrderPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    orders: List[CustomerOrderRead]
    total_count: int
    page: int
    per_page: int
    pages: int


# ----------------- CUSTOMER ORDER WITH ITEMS AND INVOICES -----------------

class CustomerOrderAndInvoiceItemCreate(BaseModel):
    """Fields required to create a new customer order with items and invoice."""
    model_config = ConfigDict(extra="forbid")
    material_uuid: str
    quantity: int
    price_per_unit: float

class CustomerOrderWithItemsAndInvoiceCreate(BaseModel):
    """Fields required to create a new customer order with items and invoice."""
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_uuid: str
    currency: Currency
    notes: Optional[str] = None
    due_date: Optional[datetime]
    items: List[CustomerOrderAndInvoiceItemCreate]

    def to_customer_order_create(self):
        return CustomerOrderCreate(
            created_by_uuid=self.created_by_uuid,
            customer_uuid=self.customer_uuid,
            notes=self.notes,
        )

    def to_customer_order_item_bulk_create(self, customer_order_uuid: str):
        return CustomerOrderItemBulkCreate(
            items=[
                CustomerOrderItemCreate(
                    created_by_uuid=self.created_by_uuid,
                    customer_order_uuid=customer_order_uuid,
                    quantity=item.quantity,
                    material_uuid=item.material_uuid,
                )
                for item in self.items
            ]
        )

    def to_invoice_create(self, customer_order_uuid: str):
        return InvoiceCreate(
            created_by_uuid=self.created_by_uuid,
            customer_uuid=self.customer_uuid,
            customer_order_uuid=customer_order_uuid,
            currency=self.currency,
            notes=self.notes,
            due_date=self.due_date,
        )

class CustomerOrderWithItemsAndInvoiceRead(BaseModel):
    """Fields required to create a new customer order with items and invoice."""
    model_config = ConfigDict(extra="forbid")
    customer_order: CustomerOrderRead
    invoices: list[InvoiceRead]

    @classmethod
    def from_customer_order_model(cls, customer_order:CustomerOrder):
        customer_order_read = CustomerOrderRead.from_orm(customer_order)
        customer_order_read.customer_order_items = [
            CustomerOrderItemRead.from_orm(item) for item in customer_order.customer_order_items
        ]

        invoice_reads = []
        for invoice in customer_order.invoices:
            invoice_read = InvoiceRead.from_orm(invoice)
            invoice_read.invoice_items = [
                InvoiceItemRead.from_orm(item) for item in invoice.invoice_items
            ]
            invoice_reads.append(invoice_read)

        return cls(
            customer_order=customer_order_read,
            invoices=invoice_reads
        )


