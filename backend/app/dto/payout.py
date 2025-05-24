from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency
from pydantic_core import ValidationError
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.invoice import InvoiceStatus


class PayoutBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    purchase_order_uuid: Optional[str] = None
    expense_uuid: Optional[str] = None
    amount: float = Field(..., gt=0)
    currency: Currency
    notes: Optional[str] = None
    employee_uuid: Optional[str] = None
    credit_note_item_uuid: Optional[str] = None

class PayoutCreate(PayoutBase):
    """Fields required to create a new payout."""
    model_config = ConfigDict(extra="forbid")

    # validate cannot have expense uuid, purchase order uuid or employee at the same time
    @model_validator(mode="before")
    @classmethod
    def check_exclusive_fields(cls, values: dict) -> dict:
        po = bool(values.get("purchase_order_uuid"))
        ex = bool(values.get("expense_uuid"))
        emp = bool(values.get("employee_uuid"))
        cni = bool(values.get("credit_note_item_uuid"))

        if not (po or ex or emp or cni):
            raise BadRequestError("At least one of purchase_order_uuid, expense_uuid, employee_uuid or credit_note_item_uuid must be set.")
        if (po + ex + emp + cni) > 1:
            raise BadRequestError("Only one of purchase_order_uuid, expense_uuid, employee_uuid or credit_note_item_uuid can be set.")
        return values


class PayoutUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None

class PayoutRead(PayoutBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    financial_account_uuid: str
    created_at: datetime
    is_deleted: bool

class PayoutListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    credit_note_item_uuid: Optional[str] = None
    purchase_order_uuid: Optional[str] = None
    expense_uuid:     Optional[str] = None
    employee_uuid:    Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class PayoutPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payouts:      List[PayoutRead]
    total_count:  int
    page:         int
    per_page:     int
    pages:        int