# app/dto/customer_order_item.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime



class CustomerOrderItemCreate(BaseModel):
    """Schema for a single customer order item creation."""
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_order_uuid: str
    quantity: int
    material_uuid: str

class CustomerOrderItemBulkCreate(BaseModel):
    """Schema for bulk creating multiple customer order items."""
    model_config = ConfigDict(extra="forbid")
    items: List[CustomerOrderItemCreate]

class CustomerOrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    created_by_uuid: Optional[str] = None
    customer_order_uuid: str
    quantity: int
    unit: str
    material_uuid: str
    uuid: str
    is_fulfilled: bool
    is_deleted: bool
    fulfilled_at: Optional[datetime]
    created_at: datetime

class CustomerOrderItemBulkFulfill(BaseModel):
    """Schema for bulk fulfilling customer order items by UUID."""
    model_config = ConfigDict(extra="forbid")
    uuids: List[str]

class CustomerOrderItemBulkDelete(BaseModel):
    """Schema for bulk deleting (soft) customer order items by UUID."""
    model_config = ConfigDict(extra="forbid")
    uuids: List[str]

class CustomerOrderItemBulkRead(BaseModel):
    """Schema for bulk reading multiple customer order items."""
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    items: List[CustomerOrderItemRead]

class CustomerOrderItemListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_order_uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class CustomerOrderItemPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[CustomerOrderItemRead]
    total_count: int
    page: int
    per_page: int
    pages: int