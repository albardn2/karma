# app/dto/customer_order_item.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import UnitOfMeasure
from app.dto.invoice_item import InvoiceItemCreate
from app.dto.invoice_item import InvoiceItemBulkCreate


class CustomerOrderItemCreate(BaseModel):
    """Schema for a single customer order item creation."""
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_order_uuid: str
    quantity: int
    material_uuid: str

class CustomerOrderItemBulkCreate(BaseModel):
    """Schema for bulk creating multiple customer order items."""
    model_config = ConfigDict(extra="forbid")
    items: List[CustomerOrderItemCreate]

class CustomerOrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_order_uuid: str
    quantity: int
    unit: UnitOfMeasure
    material_uuid: str
    material_name: str
    uuid: str
    is_fulfilled: bool
    is_deleted: bool
    fulfilled_at: Optional[datetime]
    created_at: datetime


class FulfillItem(BaseModel):
    """Schema for fulfilling a customer order item."""
    model_config = ConfigDict(extra="forbid")
    customer_order_item_uuid: str
    inventory_uuid: Optional[str] = None

class UnFulfillItem(BaseModel):
    """Schema for fulfilling a customer order item."""
    model_config = ConfigDict(extra="forbid")
    customer_order_item_uuid: str

class CustomerOrderItemBulkFulfill(BaseModel):
    """Schema for bulk fulfilling customer order items by UUID."""
    model_config = ConfigDict(extra="forbid")
    items: List[FulfillItem]
    # current trip stop where fulfillment happens; attributes the vehicle sale to
    # this stop's trip (overriding the order's own stop, e.g. previously-created
    # orders handed off during a trip). Falls back to the order's stop if unset.
    trip_stop_uuid: Optional[str] = None

class CustomerOrderItemQuantityUpdate(BaseModel):
    """Change one line's ordered quantity — the payment-gated edit that
    cascades to the invoice and order totals (and re-syncs stock if fulfilled).
    gt=0: a zero/negative-quantity line is not an edit, it is a deletion, which
    is the bulk-delete route's job."""
    model_config = ConfigDict(extra="forbid")
    quantity: int = Field(gt=0)


class CustomerOrderItemBulkUnFulfill(BaseModel):
    """Schema for bulk unfulfilling customer order items by UUID."""
    model_config = ConfigDict(extra="forbid")
    items: List[UnFulfillItem]

class CustomerOrderItemBulkDelete(BaseModel):
    """Schema for bulk deleting (soft) customer order items by UUID."""
    model_config = ConfigDict(extra="forbid")
    uuids: List[str]

class CustomerOrderItemBulkRead(BaseModel):
    """Schema for bulk reading multiple customer order items."""
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    items: List[CustomerOrderItemRead]

class CustomerOrderItemListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uuid: Optional[str] = None
    customer_order_uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class CustomerOrderItemPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[CustomerOrderItemRead]
    total_count: int
    page: int
    per_page: int
    pages: int