from enum import Enum

from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class CustomerCategory(str, Enum):
    """Enum for customer categories."""
    ROASTERY = "roastery"
    RESTAURANT = "restaurant"
    SMALL_RETAIL = "small_retail"
    SUPERMARKET = "supermarket"


class CustomerBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: str
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: CustomerCategory
    coordinates: Optional[str] = None
    created_by_uuid : Optional[UUID] = None

class CustomerCreate(CustomerBase):
    """What’s required when creating a new customer."""
    company_name: str
    full_name: str
    phone_number: str
    full_address: str
    category: CustomerCategory

class CustomerUpdate(BaseModel):
    """All fields optional for partial updates."""
    email_address: Optional[EmailStr] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[CustomerCategory] = None
    coordinates: Optional[str] = None
    is_deleted: Optional[bool] = None

class CustomerRead(CustomerBase):
    """What we return to clients."""
    uuid: UUID
    created_at: datetime
    is_deleted: bool

    class Config:
        orm_mode = True


class CustomerReadList(BaseModel):
    """What we return to clients."""
    customers: list[CustomerRead]
    total_count: int

    class Config:
        orm_mode = True