# app/dto/trip.py
from enum import Enum

from pydantic import AliasChoices, AliasPath, BaseModel, ConfigDict, Field, field_validator
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

    name: Optional[str] = Field(None, max_length=120)

    created_by_uuid: Optional[str] = None
    vehicle_uuid: str
    # default to list
    service_area_names: Optional[List[str]] = Field(default_factory=list)
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

    name: Optional[str] = Field(None, max_length=120)

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
    # optional label for the run; null for trips created before this existed, so
    # every client keeps its old fallback (plate, or a truncated uuid)
    name: Optional[str] = None
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
    start_inventory: Optional[dict] = None
    end_inventory: Optional[dict] = None
    # display fields: plate from the vehicle relationship; assignee is
    # enriched by the list route (it lives on the start_trip task result)
    vehicle_plate: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("vehicle_plate", AliasPath("vehicle", "plate_number")))
    assigned_username: Optional[str] = None
    inventory_reconciliation: Optional[dict] = None
    expected_cash: Optional[dict] = None  # {currency: amount} collected at this trip's stops
    trip_expenses: Optional[dict] = None  # {currency: amount} costs booked to this trip, paid or not
    trip_expenses_paid: Optional[dict] = None  # of those, the cash actually paid out
    trip_expenses_unpaid: Optional[dict] = None  # booked but not settled: a payable, not missing cash
    net_expected_cash: Optional[dict] = None  # collected minus what was PAID
    # audit sign-off: is_audited derives from audited_at on the model, so the
    # flag and the timestamp cannot disagree. audited_by_username is resolved by
    # the routes, like assigned_username.
    is_audited: bool = False
    audited_at: Optional[datetime] = None
    audited_by_uuid: Optional[str] = None
    audited_by_username: Optional[str] = None

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
    workflow_execution_uuid: Optional[str] = None
    status: Optional[TripStatus] = None
    # True -> only signed-off trips, False -> only those still to review.
    # Omitted means both, so existing callers are unaffected.
    is_audited: Optional[bool] = None
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


# One page of trips is the realistic selection, and the aggregate walks each
# trip's stops in Python, so the cost is bounded by keeping this near the max
# page size rather than letting a caller ask for the whole history at once.
MAX_SUMMARY_TRIPS = 100


class TripSummaryParams(BaseModel):
    """Which trips to roll up. Comma-separated so this stays a GET: the summary
    only sums figures the caller can already read one trip at a time."""
    model_config = ConfigDict(extra="forbid")

    trip_uuids: List[str] = Field(..., min_length=1, max_length=MAX_SUMMARY_TRIPS)

    @field_validator("trip_uuids", mode="before")
    def _split_and_dedupe(cls, v):
        if isinstance(v, str):
            v = v.split(",")
        seen, out = set(), []
        for raw in v or []:
            u = raw.strip() if isinstance(raw, str) else raw
            # a uuid sent twice must not be counted twice — the totals would lie
            if u and u not in seen:
                seen.add(u)
                out.append(u)
        return out


class TripSummaryCash(BaseModel):
    """Cash for one currency. Never summed across currencies — a trip can
    collect USD and spend SYP, and adding those together is meaningless."""
    model_config = ConfigDict(extra="forbid")

    currency: str
    collected: float = Field(..., description="Cash taken at the stops")
    expenses: float = Field(..., description="Costs booked to the trips, paid or not")
    expenses_paid: float = Field(..., description="Of those costs, the cash actually paid out")
    expenses_unpaid: float = Field(
        ...,
        description="Booked but not settled — owed to whoever fronted it, not cash "
                    "missing from the drivers, so it does not move the net",
    )
    net: float = Field(..., description="collected - expenses_paid: what should come back")


class TripSummaryMaterial(BaseModel):
    """Stock movement for one material across the selected trips.

    `net_change` is what actually left the vans (returned - loaded), so it
    carries shrinkage as well as sales; `sold` is the clean sales figure. Both
    are reported because an audit needs to see them disagree.
    """
    model_config = ConfigDict(extra="forbid")

    material_uuid: str
    material_name: Optional[str] = None
    measure_unit: Optional[str] = None
    loaded: float = Field(..., description="Sum of the start snapshots")
    sold: float = Field(..., description="Sold off the vans (vehicle sale events)")
    returned: float = Field(..., description="Sum of the end snapshots, where taken")
    net_change: float = Field(..., description="returned - loaded; negative means stock left")
    variance: float = Field(..., description="Sum of (actual end - expected end)")
    net_change_partial: bool = Field(
        False,
        description="True when a selected trip moved this material but has no end "
                    "snapshot, so net_change/returned/variance cover fewer trips than sold",
    )


class TripSummary(BaseModel):
    """Aggregate of several trips: cash per currency, stock per material."""
    model_config = ConfigDict(extra="forbid")

    trip_count: int = Field(..., description="Trips actually included")
    trip_uuids: List[str] = Field(..., description="The included trips")
    cash: List[TripSummaryCash] = Field(default_factory=list)
    materials: List[TripSummaryMaterial] = Field(default_factory=list)
    missing_uuids: List[str] = Field(
        default_factory=list,
        description="Requested but not found in this account (deleted or foreign) — "
                    "reported rather than silently counted as zero",
    )
    trips_without_end_inventory: List[str] = Field(
        default_factory=list,
        description="Included trips with no end snapshot: their stock has not been "
                    "counted back in, so they contribute to sold but not to net_change",
    )
