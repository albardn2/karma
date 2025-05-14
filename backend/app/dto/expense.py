from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency
from app.dto.invoice import InvoiceStatus


# import your actual enum from wherever you define it
class ExpenseCategory(str, Enum):
    ELECTRICITY = "electricity"
    WATER = "water"
    RENT = "rent"
    MAINTENANCE = "maintenance"
    EQUIPMENT = "equipment"
    SUPPLIES = "supplies"
    TRAVEL = "travel"
    MEALS = "meals"
    OTHER = "other"

class ExpenseBase(BaseModel):
    amount: float
    currency: Currency
    category: ExpenseCategory
    vendor_uuid: Optional[str] = None
    description: Optional[str] = None



class ExpenseCreate(ExpenseBase):
    """Fields required to create a new expense."""
    created_by_uuid: Optional[str] = None
    should_pay: Optional[bool] = False

class ExpenseUpdate(BaseModel):
    """All fields optional for partial updates."""
    vendor_uuid: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    description: Optional[str] = None


class ExpenseRead(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    uuid: str
    created_by_uuid: Optional[str] = None
    status : InvoiceStatus
    created_at: datetime
    is_deleted: bool

class ExpenseReadList(BaseModel):
    expenses: List[ExpenseRead]
    total_count: int

class ExpenseListParams(BaseModel):
    vendor_uuid: Optional[str] = None
    category:    Optional[ExpenseCategory] = None
    status :    Optional[InvoiceStatus] = None
    start:       Optional[datetime] = None  # ISO timestamps in query
    end:         Optional[datetime] = None
    page:        int = 1
    per_page:    int = 20


class ExpensePage(BaseModel):
    """Paginated list response."""
    expenses: List[ExpenseRead]
    total_count: int
    page: int
    per_page: int
    pages: int


