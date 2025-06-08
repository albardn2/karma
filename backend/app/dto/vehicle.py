# app/dto/vehicle.py
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class VehicleStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SOLD = "sold"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"
    UTILIZED = "utilized"


class VehicleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    plate_number: str
    model: str
    make: str
    year: int
    color: str
    status: VehicleStatus
    notes: Optional[str] = None
    vin: Optional[str] = None


class VehicleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    plate_number: Optional[str] = None
    model: Optional[str] = None
    make: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = None
    status: Optional[VehicleStatus] = None    # ← newly added, optional
    notes: Optional[str] = None
    vin: Optional[str] = None


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    plate_number: str
    model: str
    make: str
    year: int
    color: str
    status: VehicleStatus
    notes: Optional[str] = None
    vin: Optional[str] = None
    is_deleted: bool


class VehicleListParams(BaseModel):
    """Pagination and filter parameters for listing vehicles."""
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    created_by_uuid: Optional[str] = None
    plate_number: Optional[str] = None
    model: Optional[str] = None
    make: Optional[str] = None
    year: Optional[int] = None
    color: Optional[str] = None
    status: Optional[VehicleStatus] = None
    vin: Optional[str] = None

    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")


class VehiclePage(BaseModel):
    """Paginated vehicle list response."""
    model_config = ConfigDict(extra="forbid")

    items: List[VehicleRead] = Field(..., description="List of vehicles on this page")
    total_count: int = Field(..., description="Total number of vehicles matching filters")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")
