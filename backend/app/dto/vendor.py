# app/dto/vendor.py
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.utils.geom_utils import lat_lon_to_wkt, wkt_or_wkb_to_lat_lon


# ← import your real enum here

class VendorCategory(str, Enum):
    RAW_MATERIALS = "raw_materials"
    EQUIPMENT = "equipment"
    SERVICES = "services"
    OTHER = "other"


class VendorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[UUID] = None
    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    # use the enum type here
    category: Optional[VendorCategory] = None
    coordinates: Optional[str] = None

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid



class VendorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    email_address: Optional[EmailStr] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[VendorCategory] = None
    coordinates: Optional[str] = None

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid


class VendorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True,extra="forbid")

    uuid: UUID
    created_by_uuid: Optional[UUID] = None
    created_at: datetime
    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    balance_per_currency: dict
    # and here too
    category: Optional[VendorCategory] = None
    coordinates: Optional[str] = None
    is_deleted: bool

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


class VendorReadList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendors: List[VendorRead]
    total_count: int


# Pagination DTOs
class VendorListParams(BaseModel):
    """Pagination parameters for listing vendors."""
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    category: Optional[VendorCategory] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    email_address: Optional[EmailStr] = None
    within_polygon: Optional[str] = None  # Expect WKT Polygon string
    page: int = Field(1, gt=0, description="Page number, starting at 1")
    per_page: int = Field(20, gt=0, le=100, description="Items per page, max 100")

class VendorPage(BaseModel):
    """Paginated vendor list response."""
    model_config = ConfigDict(extra="forbid")

    vendors: List[VendorRead] = Field(..., description="List of vendors on this page")
    total_count: int        = Field(..., description="Total number of vendors")
    page: int               = Field(..., description="Current page number")
    per_page: int           = Field(..., description="Number of items per page")
    pages: int              = Field(..., description="Total number of pages")
