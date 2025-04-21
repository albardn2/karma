from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class EmployeeRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    OPERATOR = "employee"
    ACCOUNTANT = "accountant"
    DRIVER = "driver"
    SALES = "sales"

class EmployeeBase(BaseModel):
    email_address: Optional[EmailStr] = None
    full_name: str
    phone_number: str
    full_address: Optional[str] = None
    identification: Optional[str] = None  # URL(s) or file path(s)
    notes: Optional[str] = None
    role: Optional[EmployeeRole] = None
    image: Optional[str] = None  # URL(s) or file path(s)

class EmployeeCreate(EmployeeBase):
    """Fields required to create a new employee."""
    full_name: str
    phone_number: str

class EmployeeUpdate(BaseModel):
    """All fields optional for partial updates."""
    email_address: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    full_address: Optional[str] = None
    identification: Optional[str] = None
    notes: Optional[str] = None
    role: Optional[EmployeeRole] = None
    image: Optional[str] = None
    is_deleted: Optional[bool] = None

class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    uuid: UUID
    created_by_uuid: Optional[UUID] = None
    created_at: datetime
    is_deleted: bool

class EmployeeListParams(BaseModel):
    """Pagination parameters for listing employees."""
    model_config = ConfigDict()

    page: int = Field(1, gt=0, description="Page number, starting from 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")


class EmployeePage(BaseModel):
    """Paginated employee list response."""
    model_config = ConfigDict()

    employees: List[EmployeeRead] = Field(..., description="List of employees on this page")
    total_count: int = Field(..., description="Total number of employees")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")
