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
    SCHOOL = "school"
    UNIVERSITY = "university"
    HOSPITAL = "hospital"



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
    # "lat,lon" of a reference point (e.g. the driver's current location).
    # When set, results are ordered nearest-first and customers without a
    # saved location are excluded.
    near: Optional[str] = None

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

# --------------------------- MAP CLUSTERS ---------------------------
#
# The map needs positions and counts, not customers. Serving it from the normal
# list endpoint is what made the app fall over: that route forces per_page to
# 10000 whenever `within_polygon` is set, and every row is a full CustomerRead
# whose `balance_per_currency` walks each order -> invoice -> items/payments/
# notes. Measured on local data: 574 bytes and 1.4 ms per customer, so 10k
# customers is ~5.7 MB and ~14 s for a single pan — and local order histories are
# sparse, so that is a floor. A phone parsing that repeatedly, once per pan, is
# the crash.
#
# So this is a separate, deliberately thin response: at most MAX_MAP_POINTS rows,
# each a position plus how many customers it stands for. Tapping a single pin
# fetches that one customer in full, which is the only place the expensive DTO is
# still needed.

# The cap the grid is sized to hit. See the route for the arithmetic that makes
# it a hard guarantee rather than a hope.
MAX_MAP_POINTS = 100


class CustomerMapClusterParams(BaseModel):
    """Which viewport to summarise, and the filters to summarise it under."""
    model_config = ConfigDict(extra="forbid")

    # WKT polygon of the visible region. Required: a map request without a
    # viewport is a request for everything, which is the bug this replaces.
    within_polygon: str
    # kept name-for-name with CustomerListParams so the same filter UI can drive
    # either endpoint without a translation layer
    category: Optional[CustomerCategory] = None
    company_name: Optional[str] = None
    full_name: Optional[str] = None


class CustomerMapCluster(BaseModel):
    """One pin: either a single customer or a group standing in for several."""
    model_config = ConfigDict(extra="forbid")

    latitude: float
    longitude: float
    # How many customers this pin represents. 1 means it is a real customer and
    # `customer_uuid`/`company_name` are populated; more than 1 means a cluster
    # and the position is the centroid of its members.
    count: int
    customer_uuid: Optional[str] = None
    company_name: Optional[str] = None
    # The real bounding box of this pin's members, which the client needs for two
    # distinct jobs. It is the zoom target when a cluster is tapped, and — more
    # importantly — a zero-span box is the exact signal that the members share a
    # coordinate and NO amount of zooming will ever separate them. Without it a
    # client can only guess, and tapping such a cluster strands the user zooming
    # forever on a pin that never splits. Four customers in the local database
    # share one point, so this is a real case, not a hypothetical.
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float


class CustomerMapClusterPage(BaseModel):
    """Every customer in the viewport is accounted for, even when clustered."""
    model_config = ConfigDict(extra="forbid")

    clusters: List[CustomerMapCluster]
    # Sum of every cluster's count — what the map can honestly claim to be
    # showing. Not a page total: nothing is truncated, only grouped.
    total_count: int
    # Grid cell size in degrees, so a client can tell how coarse the grouping is
    # (and so this is debuggable from a response body alone).
    cell_size_degrees: float
    max_points: int = MAX_MAP_POINTS
