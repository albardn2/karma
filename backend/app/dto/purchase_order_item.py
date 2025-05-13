## app/dto/purchase_order_item.py
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List, Union
from datetime import datetime

from app.dto.common_enums import Currency, UnitOfMeasure
from models.common import PurchaseOrderItem as PurchaseOrderItemModel
from app.entrypoint.routes.common.errors import BadRequestError


class PurchaseOrderItemBase(BaseModel):
    purchase_order_uuid: Optional[str] = None # for po with item create
    material_uuid:       str
    quantity:            int
    price_per_unit:      float
    currency:            Optional[Currency] = None
    unit:                UnitOfMeasure

class PurchaseOrderItemCreate(PurchaseOrderItemBase):
    """Fields required to create a new purchase order item."""
    created_by_uuid: Optional[str]      = None
    quantity_received:   float           = 0.0

class PurchaseOrderItemUpdate(BaseModel):
    """All fields optional for partial updates."""
    purchase_order_uuid: Optional[str]      = None
    material_uuid:       Optional[str]      = None
    quantity:            Optional[int]       = None
    price_per_unit:      Optional[float]     = None
    currency:            Optional[Currency]  = None
    unit:                Optional[UnitOfMeasure] = None
    quantity_received:   Optional[float]     = None
    is_fulfilled:        Optional[bool]      = None
    fulfilled_at:        Optional[datetime]  = None
    is_deleted:          Optional[bool]      = None

class PurchaseOrderItemRead(BaseModel):
    """Response model for a single purchase order item, including total_price."""
    model_config = ConfigDict(from_attributes=True)

    uuid:               str
    created_by_uuid:    Optional[str] = None
    purchase_order_uuid: str
    material_uuid:      str
    quantity:           int
    price_per_unit:     float
    currency:           Currency
    unit:               UnitOfMeasure
    quantity_received:  float
    is_fulfilled:       bool
    fulfilled_at:       Optional[datetime] = None
    created_at:         datetime
    is_deleted:         bool
    total_price:        float  # computed


class PurchaseOrderItemListParams(BaseModel):
    """Filters and pagination for listing purchase order items."""
    model_config = ConfigDict()

    purchase_order_uuid: Optional[str]   = None
    material_uuid:       Optional[str]   = None
    is_fulfilled:        Optional[bool]   = None
    start_date:          Optional[datetime] = Field(None, description="Filter created_at >=")
    end_date:            Optional[datetime] = Field(None, description="Filter created_at <=")

    page:     int = Field(1, gt=0, description="Page number >=1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page <=100")

class PurchaseOrderItemPage(BaseModel):
    """Paginated purchase order item list response."""
    model_config = ConfigDict()

    items:       List[PurchaseOrderItemRead] = Field(..., description="Items on this page")
    total_count: int                        = Field(..., description="Total number of items")
    page:        int                        = Field(..., description="Current page number")
    per_page:    int                        = Field(..., description="Items per page")
    pages:       int                        = Field(..., description="Total pages available")



class POFulfillItem(BaseModel):
    """Schema for fulfilling a purchase order item."""
    model_config = ConfigDict(extra="forbid")
    purchase_order_item_uuid: str
    warehouse_uuid: Optional[str] = None
    inventory_uuid: Optional[str] = None

class PurchaseOrderItemBulkFulfill(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[POFulfillItem]