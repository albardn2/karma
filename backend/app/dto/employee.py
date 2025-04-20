from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr
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

class EmployeeReadList(BaseModel):
    employees: List[EmployeeRead]
    total_count: int
