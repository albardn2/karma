from enum import Enum

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import Currency

from app.utils.geom_utils import lat_lon_to_wkt
from app.utils.geom_utils import wkt_or_wkb_to_lat_lon


class CustomerCategory(str, Enum):
    """Enum for customer categories."""
    ROASTERY = "roastery"
    RESTAURANT = "restaurant"
    MINIMARKET = "minimarket"
    SUPERMARKET = "supermarket"
    DISTRIBUTER = "distributer"



class CustomerBase(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    email_address: Optional[EmailStr] = None
    company_name: str
    full_name: str
    phone_number: str
    full_address: str
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: CustomerCategory
    coordinates: Optional[str] = None
    created_by_uuid : Optional[str] = None

class CustomerCreate(CustomerBase):
    """What’s required when creating a new customer."""
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    @field_validator("coordinates", mode="before")
    def parse_latlon_to_wkt(cls, v: str) -> str:
        """
        Expect `coordinates` as "lat,lon" (e.g. "29.7604,-95.3698").
        Convert to a WKT Point in the form "POINT(lon lat)".
        """
        if v is None:
            return v # optional
        return lat_lon_to_wkt(coords=v)  # This will raise BadRequestError if invalid


class CustomerUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    email_address: Optional[EmailStr] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    full_address: Optional[str] = None
    business_cards: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[CustomerCategory] = None
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

class CustomerRead(CustomerBase):
    """What we return to clients."""
    model_config = ConfigDict(extra="forbid")

    uuid: str
    created_at: datetime
    is_deleted: bool
    balance_per_currency: dict[Currency, float]

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




class CustomerReadList(BaseModel):
    """What we return to clients."""
    model_config = ConfigDict(extra="forbid")

    customers: list[CustomerRead]
    total_count: int



class CustomerListParams(BaseModel):
    """Pagination parameters for listing customers."""
    model_config = ConfigDict(extra="forbid")
    uuid: Optional[str] = None
    category: Optional[CustomerCategory] = None
    email_address: Optional[str] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    within_polygon: Optional[str] = None  # WKT Polygon string

    page: int = Field(1, gt=0, description="Page number, starting from 1")
    per_page: int = Field(20, gt=0, le=1000, description="Items per page, max 100")


class CustomerPage(BaseModel):
    """Paginated customer list response."""
    model_config = ConfigDict(extra="forbid")

    customers: List[CustomerRead] = Field(..., description="List of customers on this page")
    total_count: int = Field(..., description="Total number of customers")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total number of pages")