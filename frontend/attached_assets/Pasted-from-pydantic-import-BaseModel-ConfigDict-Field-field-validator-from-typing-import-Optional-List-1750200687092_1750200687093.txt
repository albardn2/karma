from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from app.utils.geom_utils import lat_lon_to_wkt, wkt_or_wkb_to_lat_lon


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

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid


class WarehouseUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    name:        Optional[str] = None
    address:     Optional[str] = None
    coordinates: Optional[str] = None
    notes:       Optional[str] = None

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid


class WarehouseRead(WarehouseBase):
    model_config = ConfigDict(from_attributes=True,extra="forbid")

    uuid:            UUID
    created_by_uuid: Optional[UUID] = None
    created_at:      datetime
    is_deleted:      bool

    @field_validator("coordinates", mode="before")
    def _wkb_or_wkt_to_latlon(cls, v):
        """
        Accept any of:
        - WKTElement → v.data is WKT
        - WKBElement → convert via to_shape
        - bytes/bytearray → shapely.wkb.loads
        - str (WKT) → shapely.wkt.loads
        Then extract lat,lon and return "lat,lon".
        """
        if v is None:
            return v
        return wkt_or_wkb_to_lat_lon(v)  # This will raise BadRequestError if invalid


class WarehouseListParams(BaseModel):
    """Pagination parameters for listing warehouses."""
    model_config = ConfigDict(extra="forbid")
    uuid : Optional[UUID] = None
    name: Optional[str] = None
    within_polygon: Optional[str] = None  # WKT Polygon
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