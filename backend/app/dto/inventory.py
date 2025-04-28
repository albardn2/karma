from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import UnitOfMeasure, Currency

class InventoryBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    material_uuid: str
    warehouse_uuid: Optional[str] = None
    notes: Optional[str] = None
    lot_id: Optional[str] = None
    expiration_date: Optional[datetime] = None
    cost_per_unit: Optional[float] = Field(None,ge =0)
    unit: UnitOfMeasure
    current_quantity: float = Field(..., ge=0)
    original_quantity: float = Field(..., ge=0)
    is_active: bool = True
    currency: Currency

class InventoryCreate(InventoryBase):
    """Fields required to create a new inventory record."""
    pass

class InventoryUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    warehouse_uuid: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[datetime] = None
    cost_per_unit: Optional[float] = Field(None, ge=0)
    unit: Optional[UnitOfMeasure] = None
    current_quantity: Optional[float] = Field(None, ge=0)
    original_quantity: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None
    currency: Optional[Currency] = None

class InventoryRead(InventoryBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_deleted: bool
    total_original_cost: float

class InventoryListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_uuid: Optional[str] = None
    warehouse_uuid: Optional[str] = None
    is_active: Optional[bool] = None
    currency: Optional[Currency] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class InventoryPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventories: List[InventoryRead]
    total_count: int
    page: int
    per_page: int
    pages: int