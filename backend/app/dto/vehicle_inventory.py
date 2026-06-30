from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency


class VehicleInventoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vehicle_uuid: str
    material_uuid: str
    created_by_uuid: Optional[str] = None
    notes: Optional[str] = None
    currency: Optional[Currency] = None
    is_active: bool = True


class VehicleInventoryUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None
    currency: Optional[Currency] = None
    is_active: Optional[bool] = None


class VehicleInventoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_by_uuid: Optional[str] = None
    vehicle_uuid: str
    material_uuid: str
    material_name: Optional[str] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    is_deleted: bool
    created_at: datetime
    current_quantity: Optional[float] = None


class VehicleInventoryListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uuid: Optional[str] = None
    vehicle_uuid: Optional[str] = None
    material_uuid: Optional[str] = None
    is_active: Optional[bool] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)


class VehicleInventoryPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vehicle_inventories: List[VehicleInventoryRead]
    total_count: int
    page: int
    per_page: int
    pages: int
