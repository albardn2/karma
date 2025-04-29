from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency

from app.dto.invoice import InvoiceStatus

from app.entrypoint.routes.common.errors import BadRequestError


class DebitNoteItemBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    amount: float = Field(..., gt=0)
    currency: Currency
    notes: Optional[str] = None
    status: InvoiceStatus
    invoice_item_uuid: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    customer_uuid: Optional[str] = None
    vendor_uuid: Optional[str] = None
    purchase_order_item_uuid: Optional[str] = None


class DebitNoteItemCreate(DebitNoteItemBase):
    """Fields required to create a new debit-note item."""

    @model_validator(mode="before")
    @classmethod
    def check_exclusive_fields(cls, values: dict) -> dict:
        po = bool(values.get("purchase_order_item_uuid"))
        v = bool(values.get("vendor_uuid"))
        cu = bool(values.get("customer_uuid"))
        co = bool(values.get("customer_order_item_uuid"))
        if not (po or co or v or cu):
            raise BadRequestError("At least one of purchase_order_item_uuid, customer_order_item_uuid, vendor_uuid or customer_uuid must be set.")
        if (po + co + v + cu) > 1:
            raise BadRequestError("Only one of purchase_order_item_uuid, customer_order_item_uuid, vendor_uuid or customer_uuid can be set.")

        return values

class DebitNoteItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None
    status: Optional[InvoiceStatus] = None

class DebitNoteItemRead(DebitNoteItemBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime

class DebitNoteItemListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_item_uuid: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    purchase_order_item_uuid: Optional[str] = None
    customer_uuid: Optional[str] = None
    vendor_uuid: Optional[str] = None
    status: Optional[InvoiceStatus] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class DebitNoteItemPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[DebitNoteItemRead]
    total_count: int
    page: int
    per_page: int
    pages: int