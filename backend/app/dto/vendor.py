# app/dto/vendor.py
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

# ← import your real enum here

class VendorCategory(str, Enum):
    RAW_MATERIALS = "raw_materials"
    EQUIPMENT = "equipment"
    SERVICES = "services"
    OTHER = "other"


class VendorCreate(BaseModel):
    created_by_uuid: Optional[UUID] = None
    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    # use the enum type here
    category: Optional[VendorCategory] = None
    coordinates: Optional[str] = None


class VendorUpdate(BaseModel):
    created_by_uuid: Optional[str] = None
    email_address: Optional[EmailStr] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[VendorCategory] = None
    coordinates: Optional[str] = None


class VendorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    created_by_uuid: Optional[UUID] = None
    created_at: datetime
    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    balance_per_currency: dict
    # and here too
    category: Optional[VendorCategory] = None
    coordinates: Optional[str] = None
    is_deleted: bool


class VendorReadList(BaseModel):
    vendors: List[VendorRead]
    total_count: int


# Pagination DTOs
class VendorListParams(BaseModel):
    """Pagination parameters for listing vendors."""
    uuid: Optional[str] = None
    model_config = ConfigDict()
    category: Optional[VendorCategory] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    email_address: Optional[EmailStr] = None
    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")

class VendorPage(BaseModel):
    """Paginated vendor list response."""
    model_config = ConfigDict()

    vendors: List[VendorRead] = Field(..., description="List of vendors on this page")
    total_count: int        = Field(..., description="Total number of vendors")
    page: int               = Field(..., description="Current page number")
    per_page: int           = Field(..., description="Number of items per page")
    pages: int              = Field(..., description="Total number of pages")
