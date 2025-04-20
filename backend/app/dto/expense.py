from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency


# import your actual enum from wherever you define it
class ExpenseCategory(str, Enum):
    ELECTRICITY = "electricity"
    WATER = "water"
    RENT = "rent"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class ExpenseBase(BaseModel):
    amount: float
    currency: Currency
    vendor_uuid: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    description: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    """Fields required to create a new expense."""
    created_by_uuid: Optional[str] = None

class ExpenseUpdate(BaseModel):
    """All fields optional for partial updates."""
    created_by_uuid: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[Currency] = None
    vendor_uuid: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    description: Optional[str] = None
    is_deleted: Optional[bool] = None

class ExpenseRead(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    is_deleted: bool

class ExpenseReadList(BaseModel):
    expenses: List[ExpenseRead]
    total_count: int

class ExpenseListParams(BaseModel):
    vendor_uuid: Optional[str] = None
    category: Optional[ExpenseCategory] = None

