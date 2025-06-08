# app/dto/trip_stop.py

from enum import Enum
from typing import Optional, List
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from shapely import wkt as shapely_wkt
from shapely.geometry import Point
from geoalchemy2.elements import WKTElement, WKBElement
from app.entrypoint.routes.common.errors import BadRequestError
from pydantic import BaseModel, ConfigDict, field_validator
from shapely import wkb as shapely_wkb
from shapely import wkt as shapely_wkt
from shapely.geometry import Point
from geoalchemy2.elements import WKTElement, WKBElement
from app.utils.geom_utils import lat_lon_to_wkt
from app.utils.geom_utils import wkt_or_wkb_to_lat_lon


class TripStopStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class TripStopCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    trip_uuid: str
    coordinates: Optional[str] = None # lat,lon as input, transform to wkt upon load
    notes: Optional[str] = None
    status: TripStopStatus
    customer_uuid: Optional[str] = None
    skip_reason: Optional[str] = None
    no_sale_reason: Optional[str] = None

    # either pass coordinates or customer_uuid but not both

    @model_validator(mode="before")
    @classmethod
    def check_exclusive_fields(cls, values: dict) -> dict:
        coords = values.get("coordinates")
        customer_uuid = values.get("customer_uuid")
        if not coords and not customer_uuid:
            raise BadRequestError("Must set either `coordinates` or `customer_uuid`.")
        return values

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid


class TripStopUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coordinates: Optional[str] = Field(
        None,
        description="WKT string representing a Point to update (e.g. 'POINT(-95.3698 29.7604)')",
    )
    notes: Optional[str] = None
    status: Optional[TripStopStatus] = None
    customer_uuid: Optional[str] = None
    skip_reason: Optional[str] = None
    no_sale_reason: Optional[str] = None

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid



class TripStopRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str]
    created_at: datetime
    trip_uuid: str
    coordinates: str
    notes: Optional[str]
    status: TripStopStatus
    customer_uuid: Optional[str]
    skip_reason: Optional[str]
    no_sale_reason: Optional[str] = None

    @field_validator("coordinates", mode="before")
    def _wkb_or_wkt_to_latlon(cls, v):
        print(f"Validating coordinates: {v}")
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





class TripStopListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trip_uuid: Optional[str] = None
    customer_uuid: Optional[str] = None
    status: Optional[TripStopStatus] = None
    intersects_area: Optional[str] = None

    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")


class TripStopPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: List[TripStopRead]
    total_count: int
    page: int
    per_page: int
    pages: int
