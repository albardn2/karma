from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency

from app.entrypoint.routes.common.errors import BadRequestError


class PaymentMethod(str, Enum):
    """Enum for payment methods."""
    CASH = "cash"

class PaymentBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    invoice_uuid: Optional[str] = None
    financial_account_uuid: Optional[str] = None
    amount: float = Field(..., gt=0)
    currency: Currency
    payment_method: PaymentMethod
    notes: Optional[str] = None
    debit_note_item_uuid: Optional[str] = None

    # validate invoice uuid or debit note item uuid must exist but not both
    @model_validator(mode="after")
    def check_exclusive_fields(self):
        # now `self` *is* the Payment instance
        has_invoice = bool(self.invoice_uuid)
        has_debit   = bool(self.debit_note_item_uuid)

        if not (has_invoice or has_debit):
            raise BadRequestError("At least one of invoice_uuid or debit_note_item_uuid must be set.")
        if has_invoice and has_debit:
            raise BadRequestError("Only one of invoice_uuid or debit_note_item_uuid can be set.")

        return self


class PaymentCreate(PaymentBase):
    """Fields required to create a new payment."""
    model_config = ConfigDict(extra="forbid")

class PaymentUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    payment_method: Optional[PaymentMethod] = None
    notes: Optional[str] = None

class PaymentRead(PaymentBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_deleted: bool

class PaymentListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_uuid: Optional[str] = None
    financial_account_uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class PaymentPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payments: List[PaymentRead]
    total_count: int
    page: int
    per_page: int
    pages: int