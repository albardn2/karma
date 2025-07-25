from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class FixedAssetBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name:                         str
    description:                  Optional[str] = None
    purchase_date:                Optional[datetime] = None
    annual_depreciation_rate:     float  # percentage
    purchase_order_item_uuid:     Optional[str] = None
    material_uuid:                Optional[str] = None
    quantity:                     Optional[float] = None
    price_per_unit:              Optional[float] = None



class FixedAssetCreate(FixedAssetBase):
    model_config = ConfigDict(extra="forbid")
    """Fields required to create a new fixed asset."""
    created_by_uuid: Optional[str] = None

class FixedAssetUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    name:                         Optional[str]     = None
    description:                  Optional[str]     = None
    purchase_date:                Optional[datetime] = None
    annual_depreciation_rate:     Optional[float]   = None
    quantity:                     Optional[float]   = None
    price_per_unit:              Optional[float]   = None

class FixedAssetRead(FixedAssetBase):
    model_config = ConfigDict(from_attributes=True,extra="forbid")
    uuid:            str
    created_by_uuid: Optional[str] = None
    created_at:      datetime
    is_deleted:      bool
    unit:           str
    quantity:        float
    price_per_unit: float
    total_price:   float
    current_value: float


class FixedAssetListParams(BaseModel):
    """Pagination and optional filters for listing fixed assets."""
    model_config = ConfigDict(extra="forbid")

    page:                     int  = Field(1, gt=0, description="Page number (>=1)")
    per_page:                 int  = Field(20, gt=0, le=100, description="Items per page (<=100)")
    uuid :                Optional[str] = None
    purchase_order_item_uuid: Optional[str] = None
    material_uuid:            Optional[str] = None
    name:                Optional[str] = None

class FixedAssetPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fixed_assets: List[FixedAssetRead] = Field(..., description="Fixed assets on this page")
    total_count:   int                 = Field(..., description="Total number of assets")
    page:          int                 = Field(..., description="Current page number")
    per_page:      int                 = Field(..., description="Items per page")
    pages:         int                 = Field(..., description="Total pages available")
