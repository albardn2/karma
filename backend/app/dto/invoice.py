# app/dto/invoice.py
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency


class InvoiceStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    VOID = "void"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"
    PARTIALLY_PAID = "partially_paid"


class InvoiceBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_uuid: str
    customer_order_uuid: str
    currency: Currency
    paid_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None

class InvoiceCreate(InvoiceBase):
    """Fields required to create a new invoice."""
    pass

class InvoiceUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(from_attributes=True,extra="forbid")
    status: Optional[InvoiceStatus] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None

class InvoiceRead(InvoiceBase):
    model_config = ConfigDict(from_attributes=True,extra="forbid")
    uuid: str
    status: InvoiceStatus
    created_at: datetime
    total_amount: float
    amount_paid: float
    amount_due: float
    is_paid: bool
    is_overdue: bool
    is_deleted: bool

class InvoiceListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_uuid: Optional[str] = None
    status: Optional[InvoiceStatus] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class InvoicePage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoices: List[InvoiceRead]
    total_count: int
    page: int
    per_page: int
    pages: int