# app/dto/customer_order.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class CustomerOrderBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_uuid: str
    notes: Optional[str] = None

class CustomerOrderCreate(CustomerOrderBase):
    """Fields required to create a new customer order."""
class CustomerOrderUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None

class CustomerOrderRead(CustomerOrderBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_fulfilled: bool
    fulfilled_at: Optional[datetime]
    is_deleted: bool

class CustomerOrderListParams(BaseModel):
    """Optional filters plus pagination for listing orders."""
    model_config = ConfigDict(extra="forbid")
    customer_uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class CustomerOrderPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    orders: List[CustomerOrderRead]
    total_count: int
    page: int
    per_page: int
    pages: int
