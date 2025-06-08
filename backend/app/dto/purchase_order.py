## app/dto/purchase_order.py
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency

from app.dto.purchase_order_item import PurchaseOrderItemCreate

from app.dto.purchase_order_item import PurchaseOrderItemRead


class PurchaseOrderStatus(str,Enum):
    """Enum for purchase order statuses."""
    DRAFT = "draft"
    PENDING = "pending"
    PAID = "paid"
    VOID = "void"



class PurchaseOrderBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendor_uuid: str
    currency: Currency
    notes: Optional[str] = None
    payout_due_date: Optional[datetime] = None

class PurchaseOrderCreate(PurchaseOrderBase):
    """Fields required to create a new purchase order."""
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None

class PurchaseOrderCreateWithItems(PurchaseOrderCreate):
    """Fields required to create a new purchase order."""
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    purchase_order_items: List[PurchaseOrderItemCreate]

    def to_purchase_order_create(self):
        """Convert to PurchaseOrderCreate."""
        data = self.model_dump(mode='json', exclude_unset=True)
        data.pop('purchase_order_items', None)
        return PurchaseOrderCreate(
            **data
        )

class PurchaseOrderUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    notes: Optional[str] = None
    payout_due_date: Optional[datetime] = None

class PurchaseOrderRead(BaseModel):
    """Response model for a single purchase order, including computed fields."""
    model_config = ConfigDict(from_attributes=True,extra="forbid")

    uuid:             str
    created_by_uuid:  Optional[str] = None
    vendor_uuid:      str
    currency:         Currency
    status:           PurchaseOrderStatus
    created_at:       datetime
    is_deleted:       bool
    notes:            Optional[str] = None
    payout_due_date:  Optional[datetime] = None

    total_amount:     float
    total_adjusted_amount: float
    net_amount_paid:      float
    net_amount_due:       float
    is_paid:          bool
    is_overdue:       Optional[bool] = None
    is_fulfilled:     bool
    fulfilled_at:     Optional[datetime] = None
    purchase_order_items: List[PurchaseOrderItemRead]

class PurchaseOrderListParams(BaseModel):
    """Filters and pagination for listing purchase orders."""
    model_config = ConfigDict(extra="forbid")
    is_overdue: Optional[bool] = None
    uuid: Optional[str] = None
    vendor_uuid: Optional[str] = None
    status:      Optional[PurchaseOrderStatus] = None
    is_paid: Optional[bool] = None
    start_date:  Optional[datetime] = Field(None, description="Filter orders created *after* this datetime")
    end_date:    Optional[datetime] = Field(None, description="Filter orders created *before* this datetime")
    is_fulfilled: Optional[bool] = None

    page:     int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

class PurchaseOrderPage(BaseModel):
    """Paginated purchase order list response."""
    model_config = ConfigDict(extra="forbid")

    purchase_orders: List[PurchaseOrderRead] = Field(..., description="Orders on this page")
    total_count:      int                     = Field(..., description="Total number of orders")
    page:             int                     = Field(..., description="Current page number")
    per_page:         int                     = Field(..., description="Number of items per page")
    pages:            int                     = Field(..., description="Total pages available")