from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency

from app.dto.common_enums import UnitOfMeasure


class InvoiceItemBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    created_by_uuid: Optional[str] = None
    invoice_uuid: str
    customer_order_item_uuid: str
    price_per_unit: float = Field(..., gt=0)

class InvoiceItemCreate(InvoiceItemBase):
    """Schema for a single invoice item creation (bulk)."""
    pass

class InvoiceItemBulkCreate(BaseModel):
    """Schema for bulk creating multiple invoice items."""
    model_config = ConfigDict(extra="forbid")
    items: List[InvoiceItemCreate]

class InvoiceItemRead(InvoiceItemBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    quantity: float
    material_name: str
    material_uuid: str
    total_price: float
    currency: Currency
    unit: UnitOfMeasure
    is_deleted: bool


class InvoiceItemBulkDelete(BaseModel):
    """Schema for bulk deleting (soft) invoice items by UUID."""
    model_config = ConfigDict(extra="forbid")
    uuids: List[str]

class InvoiceItemBulkRead(BaseModel):
    """Schema for bulk reading multiple invoice items."""
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    items: List[InvoiceItemRead]

class InvoiceItemListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invoice_uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class InvoiceItemPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[InvoiceItemRead]
    total_count: int
    page: int
    per_page: int
    pages: int