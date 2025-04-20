from enum import Enum
from pydantic import BaseModel, ConfigDict
from typing import Optional
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
    created_by_uuid: Optional[UUID] = None
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
    created_by_uuid: Optional[UUID] = None
    is_deleted: Optional[bool] = None

class MaterialRead(MaterialBase):
    """
    What we return to clients.
    """
    uuid: UUID
    created_at: datetime
    is_deleted: Optional[bool] = None

    class Config:
        orm_mode = True

class MaterialReadList(BaseModel):
    """
    Return for a list endpoint.
    """
    materials: list[MaterialRead]
    total_count: int

    class Config:
        orm_mode = True
