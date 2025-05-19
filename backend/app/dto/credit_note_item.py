from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency
from app.dto.invoice import InvoiceStatus
from app.entrypoint.routes.common.errors import BadRequestError


class CreditNoteItemBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    amount: float
    currency: Currency
    notes: Optional[str] = None
    invoice_item_uuid: Optional[str] = None
    customer_uuid: Optional[str] = None
    vendor_uuid: Optional[str] = None
    purchase_order_item_uuid: Optional[str] = None
    inventory_change : Optional[float] = None



class CreditNoteItemCreate(CreditNoteItemBase):
    """Fields required to create a new credit-note item."""

    @model_validator(mode="before")
    @classmethod
    def check_exclusive_fields(cls, values: dict) -> dict:
        po = bool(values.get("purchase_order_item_uuid"))
        v  = bool(values.get("vendor_uuid"))
        cu = bool(values.get("customer_uuid"))
        ii = bool(values.get("invoice_item_uuid"))
        if not (po or ii or v or cu):
            raise BadRequestError(
                "At least one of purchase_order_item_uuid, customer_order_item_uuid, vendor_uuid or customer_uuid must be set."
            )
        if (po + ii + v + cu) > 1:
            raise BadRequestError(
                "Only one of purchase_order_item_uuid, customer_order_item_uuid, vendor_uuid or customer_uuid can be set."
            )

        if values.get("inventory_change") is not None and not (values.get("purchase_order_item_uuid") or values.get("invoice_item_uuid")):
            raise BadRequestError(
                "inventory_change can only be set if purchase_order_item_uuid or customer_order_item_uuid is set."
            )

        return values


class CreditNoteItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None


class CreditNoteItemRead(CreditNoteItemBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    status: InvoiceStatus
    created_at: datetime
    is_deleted: bool
    amount_paid: float
    amount_due: float
    paid_at: Optional[datetime]
    is_paid: bool



class CreditNoteItemListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_item_uuid: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    purchase_order_item_uuid: Optional[str] = None
    customer_uuid: Optional[str] = None
    vendor_uuid: Optional[str] = None
    status: Optional[InvoiceStatus] = None
    is_paid: Optional[bool] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)


class CreditNoteItemPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[CreditNoteItemRead]
    total_count: int
    page: int
    per_page: int
    pages: int