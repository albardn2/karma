## app/dto/pricing.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import UnitOfMeasure



class PricingBase(BaseModel):
    material_uuid: str
    price_per_unit: float
    currency: str

class PricingCreate(PricingBase):
    """Fields required to create a new pricing."""
    created_by_uuid: Optional[str] = None

class PricingUpdate(BaseModel):
    """All fields optional for partial updates."""
    material_uuid: Optional[str] = None
    price_per_unit: Optional[float] = None
    currency: Optional[str] = None
    created_by_uuid: Optional[str] = None
    is_deleted: Optional[bool] = None

class PricingRead(BaseModel):
    """Response model for a single pricing."""
    model_config = ConfigDict(from_attributes=True)

    uuid: str
    created_by_uuid: Optional[str] = None
    material_uuid: str
    price_per_unit: float
    currency: str
    created_at: datetime
    is_deleted: bool
    unit: UnitOfMeasure = None

class PricingListParams(BaseModel):
    """Pagination parameters for listing pricings."""
    model_config = ConfigDict()

    page: int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

class PricingPage(BaseModel):
    """Paginated pricing list response."""
    model_config = ConfigDict()

    pricings: List[PricingRead] = Field(..., description="Pricings on this page")
    total_count: int            = Field(..., description="Total number of pricings")
    page: int                   = Field(..., description="Current page number")
    per_page: int               = Field(..., description="Number of items per page")
    pages: int                  = Field(..., description="Total pages available")
