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
    cost_per_unit: Optional[float] = Field(None)
    unit: UnitOfMeasure
    current_quantity: Optional[float] = Field(None)
    original_quantity: Optional[float] = Field(None)
    is_active: bool = True
    currency: Optional[Currency]  = None

class InventoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_uuid: str
    warehouse_uuid: str

    created_by_uuid: Optional[str] = None
    notes: Optional[str] = None
    lot_id: Optional[str] = None
    expiration_date: Optional[datetime] = None
    is_active: bool = True

class InventoryUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    warehouse_uuid: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[datetime] = None
    is_active: Optional[bool] = None

class InventoryRead(InventoryBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_deleted: bool
    total_original_cost: Optional[float] = None

class InventoryListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid : Optional[str] = None
    material_uuid: Optional[str] = None
    warehouse_uuid: Optional[str] = None
    is_active: Optional[bool] = None
    currency: Optional[Currency] = None
    current_quantity: Optional[float] = None
    original_quantity: Optional[float] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class InventoryPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventories: List[InventoryRead]
    total_count: int
    page: int
    per_page: int
    pages: int