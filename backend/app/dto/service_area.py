# app/dto/service_area.py
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List
from datetime import datetime
from shapely import wkb
from shapely import wkt as shapely_wkt
from geoalchemy2.elements import WKBElement, WKTElement
from app.entrypoint.routes.common.errors import BadRequestError
from shapely.geometry import shape
from geoalchemy2.shape import to_shape


class ServiceAreaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    name: str
    description: Optional[str] = None
    geometry: str

    @field_validator("geometry", mode="before")
    def validate_geometry(cls, v):
        """
        Ensure that `v` is a valid Polygon in WKT form.
        Raises ValueError if:
         - v is not a string
         - v cannot be parsed as WKT
         - parsed geometry is not a Polygon or is invalid
        """
        if not isinstance(v, str):
            raise BadRequestError("`geometry` must be a WKT string representing a Polygon")

        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise BadRequestError(f"Invalid WKT format: {e}")

        if geom.geom_type != "Polygon":
            raise BadRequestError(f"Geometry must be a Polygon, got {geom.geom_type}")

        if not geom.is_valid:
            raise BadRequestError("Geometry must be a valid (non‐self‐intersecting) Polygon")

        return v


class ServiceAreaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    geometry: Optional[str] = None

    @field_validator("geometry", mode="before")
    def validate_geometry(cls, v):
        """
        Ensure that `v` is a valid Polygon in WKT form.
        Raises ValueError if:
         - v is not a string
         - v cannot be parsed as WKT
         - parsed geometry is not a Polygon or is invalid
        """
        if not isinstance(v, str):
            raise BadRequestError("`geometry` must be a WKT string representing a Polygon")

        try:
            geom = shapely_wkt.loads(v)
        except Exception as e:
            raise BadRequestError(f"Invalid WKT format: {e}")

        if geom.geom_type != "Polygon":
            raise BadRequestError(f"Geometry must be a Polygon, got {geom.geom_type}")

        if not geom.is_valid:
            raise BadRequestError("Geometry must be a valid (non‐self‐intersecting) Polygon")

        return v


class ServiceAreaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    name: str
    description: Optional[str] = None
    geometry: str
    is_deleted: bool
    @field_validator("geometry", mode="before")
    def _ensure_wkt(cls, v):
        """
        Convert any GeoAlchemy2 geometry element (WKBElement or WKTElement)
        into a plain WKT string before Pydantic serializes it.
        """
        if v is None:
            return v

        # 1) If it’s already a Python string (assume valid WKT), return unchanged
        if isinstance(v, str):
            return v

        # 2) If it’s a WKTElement, v.data holds the WKT text
        if isinstance(v, WKTElement):
            return v.data

        # 3) If it’s a WKBElement, use geoalchemy2.shape.to_shape(...) to get a Shapely geometry, then .wkt
        if isinstance(v, WKBElement):
            shapely_geom = to_shape(v)
            return shapely_geom.wkt

        # 4) If it’s raw bytes, attempt Shapely WKB load
        if isinstance(v, (bytes, bytearray)):
            try:
                from shapely import wkb
                geom = wkb.loads(bytes(v))
                return geom.wkt
            except Exception:
                pass

        # Otherwise, return as‐is (Pydantic will error if it’s not a string)
        return v


class ServiceAreaListParams(BaseModel):
    """Pagination and filter parameters for listing service areas."""
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    created_by_uuid: Optional[str] = None
    name: Optional[str] = None
    intersects_polygon: Optional[str] = None  # WKT format for polygon geometry

    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")


class ServiceAreaPage(BaseModel):
    """Paginated service area list response."""
    model_config = ConfigDict(extra="forbid")

    items: List[ServiceAreaRead] = Field(..., description="List of service areas on this page")
    total_count: int = Field(..., description="Total number of service areas matching filters")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")
