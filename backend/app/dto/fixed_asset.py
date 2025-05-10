from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class FixedAssetBase(BaseModel):
    name:                         str
    description:                  Optional[str] = None
    purchase_date:                datetime
    current_value:                float
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
    current_value:                Optional[float]   = None
    annual_depreciation_rate:     Optional[float]   = None
    quantity:                     Optional[float]   = None
    price_per_unit:              Optional[float]   = None

class FixedAssetRead(FixedAssetBase):
    model_config = ConfigDict(from_attributes=True)
    uuid:            str
    created_by_uuid: Optional[str] = None
    created_at:      datetime
    is_deleted:      bool
    unit:           str
    quantity:        float
    price_per_unit: float
    total_price:   float


class FixedAssetListParams(BaseModel):
    """Pagination and optional filters for listing fixed assets."""
    page:                     int  = Field(1, gt=0, description="Page number (>=1)")
    per_page:                 int  = Field(20, gt=0, le=100, description="Items per page (<=100)")
    purchase_order_item_uuid: Optional[str] = None
    material_uuid:            Optional[str] = None

class FixedAssetPage(BaseModel):
    model_config = ConfigDict()

    fixed_assets: List[FixedAssetRead] = Field(..., description="Fixed assets on this page")
    total_count:   int                 = Field(..., description="Total number of assets")
    page:          int                 = Field(..., description="Current page number")
    per_page:      int                 = Field(..., description="Items per page")
    pages:         int                 = Field(..., description="Total pages available")
