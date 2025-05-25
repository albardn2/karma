from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class WarehouseBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    address: str
    coordinates: Optional[str] = None
    notes: Optional[str]       = None


class WarehouseCreate(WarehouseBase):
    """Fields required to create a new warehouse."""
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[UUID] = None

class WarehouseUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    name:        Optional[str] = None
    address:     Optional[str] = None
    coordinates: Optional[str] = None
    notes:       Optional[str] = None

class WarehouseRead(WarehouseBase):
    model_config = ConfigDict(from_attributes=True,extra="forbid")

    uuid:            UUID
    created_by_uuid: Optional[UUID] = None
    created_at:      datetime
    is_deleted:      bool

class WarehouseListParams(BaseModel):
    """Pagination parameters for listing warehouses."""
    model_config = ConfigDict(extra="forbid")
    uuid : Optional[UUID] = None
    name: Optional[str] = None

    page:     int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

class WarehousePage(BaseModel):
    """Paginated warehouse list response."""
    model_config = ConfigDict(extra="forbid")

    warehouses:  List[WarehouseRead] = Field(..., description="Warehouses on this page")
    total_count: int                 = Field(..., description="Total number of warehouses")
    page:        int                 = Field(..., description="Current page number")
    per_page:    int                 = Field(..., description="Number of items per page")
    pages:       int                 = Field(..., description="Total pages available")