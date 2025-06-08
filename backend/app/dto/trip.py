# app/dto/trip.py
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from datetime import datetime

from shapely import wkt as shapely_wkt
from shapely.geometry import shape
from geoalchemy2.elements import WKBElement, WKTElement

class TripStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"




class InventoryInput(BaseModel):
    inventory_uuid:str
    quantity: float
    material_name: Optional[str] = None
    lot_id: Optional[str] = None



class Tripoutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cash_collected: float
    inventory_left: list[InventoryInput]


class TripData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input_inventory: Optional[List[InventoryInput]] = None
    output: Optional[Tripoutput] = None


class TripCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    vehicle_uuid: str
    service_area_uuid: Optional[str] = None
    distribution_area: Optional[str] = None  # POLYGON WKT
    notes: Optional[str] = None
    status: TripStatus  # e.g., planned, in_progress, completed, cancelled
    start_warehouse_uuid: Optional[str] = None
    end_warehouse_uuid: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    start_point: Optional[str] = None  # POINT WKT
    end_point: Optional[str] = None  # POINT WKT
    data: Optional[dict] = None
    workflow_execution_uuid: Optional[str] = None


    @field_validator("distribution_area", mode="before")
    def validate_distribution_area_polygon(cls, v):
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("`distribution_area` must be a WKT string representing a Polygon")
        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise ValueError(f"Invalid WKT format for distribution_area: {e}")
        if geom.geom_type != "Polygon" or not geom.is_valid:
            raise ValueError("`distribution_area` must be a valid Polygon")
        return v

    @field_validator("start_point", mode="before")
    def validate_start_point(cls, v):
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("`start_point` must be a WKT string representing a Point")
        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise ValueError(f"Invalid WKT format for start_point: {e}")
        if geom.geom_type != "Point" or not geom.is_valid:
            raise ValueError("`start_point` must be a valid Point")
        return v

    @field_validator("end_point", mode="before")
    def validate_end_point(cls, v):
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("`end_point` must be a WKT string representing a Point")
        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise ValueError(f"Invalid WKT format for end_point: {e}")
        if geom.geom_type != "Point" or not geom.is_valid:
            raise ValueError("`end_point` must be a valid Point")
        return v


class TripUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_uuid: Optional[str] = None
    service_area_uuid: Optional[str] = None
    distribution_area: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[TripStatus] = None
    start_warehouse_uuid: Optional[str] = None
    end_warehouse_uuid: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    start_point: Optional[str] = None
    end_point: Optional[str] = None
    data: Optional[dict] = None
    workflow_execution_uuid: Optional[str] = None


    @field_validator("distribution_area", mode="before")
    def validate_distribution_area_polygon(cls, v):
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("`distribution_area` must be a WKT string representing a Polygon")
        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise ValueError(f"Invalid WKT format for distribution_area: {e}")
        if geom.geom_type != "Polygon" or not geom.is_valid:
            raise ValueError("`distribution_area` must be a valid Polygon")
        return v

    @field_validator("start_point", mode="before")
    def validate_start_point(cls, v):
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("`start_point` must be a WKT string representing a Point")
        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise ValueError(f"Invalid WKT format for start_point: {e}")
        if geom.geom_type != "Point" or not geom.is_valid:
            raise ValueError("`start_point` must be a valid Point")
        return v

    @field_validator("end_point", mode="before")
    def validate_end_point(cls, v):
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("`end_point` must be a WKT string representing a Point")
        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise ValueError(f"Invalid WKT format for end_point: {e}")
        if geom.geom_type != "Point" or not geom.is_valid:
            raise ValueError("`end_point` must be a valid Point")
        return v


class TripRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    vehicle_uuid: str
    service_area_uuid: Optional[str] = None
    distribution_area: Optional[str] = None
    notes: Optional[str] = None
    status: TripStatus
    start_warehouse_uuid: Optional[str] = None
    end_warehouse_uuid: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    start_point: Optional[str] = None
    end_point: Optional[str] = None
    data: Optional[dict] = None
    workflow_execution_uuid: Optional[str] = None

    @field_validator("distribution_area", "start_point", "end_point", mode="before")
    def _ensure_wkt(cls, v):
        if v is None:
            return v
        # Already a WKT string?
        if isinstance(v, str):
            return v
        # If WKTElement, return .data
        if isinstance(v, WKTElement):
            return v.data
        # If WKBElement, convert via to_shape
        if isinstance(v, WKBElement):
            from geoalchemy2.shape import to_shape
            return to_shape(v).wkt
        # If raw bytes, try Shapely WKB load
        if isinstance(v, (bytes, bytearray)):
            from shapely import wkb
            return wkb.loads(bytes(v)).wkt
        return v


class TripListParams(BaseModel):
    """Pagination and filter parameters for listing trips."""
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    created_by_uuid: Optional[str] = None
    vehicle_uuid: Optional[str] = None
    service_area_uuid: Optional[str] = None
    status: Optional[TripStatus] = None
    intersects_area: Optional[str] = None  # POLYGON WKT to intersect with trip.geometry

    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")


class TripPage(BaseModel):
    """Paginated trip list response."""
    model_config = ConfigDict(extra="forbid")

    items: List[TripRead] = Field(..., description="List of trips on this page")
    total_count: int = Field(..., description="Total number of trips matching filters")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")
