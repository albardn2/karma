from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.geom_utils import wkt_or_wkb_to_lat_lon


class LocationTrackingConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    trip_cadence_seconds: int
    history_cadence_seconds: int
    history_retention_days: int
    updated_at: Optional[datetime] = None


class LocationTrackingConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trip_cadence_seconds: Optional[int] = Field(None, gt=0, le=3600)
    history_cadence_seconds: Optional[int] = Field(None, gt=0, le=86400)
    history_retention_days: Optional[int] = Field(None, gt=0, le=365)


class LocationPingRead(BaseModel):
    """A stored sample, serialized for playback."""
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    coordinates: str  # "lat,lon"
    recorded_at: datetime
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    trip_uuid: Optional[str] = None

    @field_validator("coordinates", mode="before")
    def _to_lat_lon(cls, v):
        return wkt_or_wkb_to_lat_lon(v)


class LocationSeriesRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    points: List[LocationPingRead]
    total_count: int


class LocationHistoryParams(BaseModel):
    """Query window for a user's stored history."""
    model_config = ConfigDict(extra="forbid")

    from_time: Optional[datetime] = None
    to_time: Optional[datetime] = None
    # cap a single response; playback UIs can page or widen cadence instead
    limit: int = Field(5000, gt=0, le=20000)
