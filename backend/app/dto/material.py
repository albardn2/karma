from enum import Enum
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.dto.common_enums import UnitOfMeasure


class MaterialType(str, Enum):
    RAW_MATERIAL = "raw_material"
    PRODUCT     = "product"
    INTERIM     = "interim"
    FIXED_ASSET  = "fixed_asset"

class MaterialBase(BaseModel):
    # when converting from ORM objects
    model_config = ConfigDict(from_attributes=True)

    name: str
    measure_unit: Optional[UnitOfMeasure] = None
    sku: str
    description: Optional[str] = None
    type: MaterialType
    created_by_uuid: Optional[str] = None
    is_deleted: Optional[bool] = False

class MaterialCreate(MaterialBase):
    """
    All the required fields to create a Material.
    Inherit name, sku, type, etc. from MaterialBase.
    """

class MaterialUpdate(BaseModel):
    """
    All fields optional for PATCH/PUT.
    """
    name: Optional[str] = None
    measure_unit: Optional[UnitOfMeasure] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    type: Optional[MaterialType] = None
    created_by_uuid: Optional[str] = None
    is_deleted: Optional[bool] = None

class MaterialRead(MaterialBase):
    """
    What we return to clients.
    """
    uuid: str
    created_at: datetime
    is_deleted: Optional[bool] = None

    class Config:
        orm_mode = True

class MaterialListParams(BaseModel):
    """Pagination parameters for listing materials."""
    model_config = ConfigDict()

    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")


class MaterialPage(BaseModel):
    """Paginated material list response."""
    model_config = ConfigDict()

    materials: List[MaterialRead] = Field(..., description="List of materials on this page")
    total_count: int = Field(..., description="Total number of materials")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")
