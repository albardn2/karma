from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency
from app.entrypoint.routes.common.errors import BadRequestError


class VehicleInventoryEventType(str, Enum):
    MANUAL = "manual"          # add stock to the vehicle (+)
    ADJUSTMENT = "adjustment"  # correct stock up or down (+/-)
    UNLOAD = "unload"          # remove stock from the vehicle (-)
    SALE = "sale"              # sold off the vehicle during a trip (-), system-generated


class VehicleInventoryEventCreate(BaseModel):
    """Create a vehicle inventory event.

    `quantity` is the magnitude entered by the user:
      - manual:     must be > 0  (added to the balance)
      - unload:     must be > 0  (removed from the balance)
      - adjustment: signed (+/-) delta applied to the balance, must be != 0
    The domain converts this into the signed delta actually stored.
    """
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    vehicle_inventory_uuid: str
    event_type: VehicleInventoryEventType
    quantity: float
    cost_per_unit: Optional[float] = None
    currency: Optional[Currency] = None
    notes: Optional[str] = None
    # set for system-generated 'sale' events tied to a fulfilled trip-stop order item
    customer_order_item_uuid: Optional[str] = None

    @model_validator(mode="after")
    def check_quantity(self):
        if self.quantity == 0:
            raise BadRequestError("quantity must be non-zero")
        positive_types = (
            VehicleInventoryEventType.MANUAL,
            VehicleInventoryEventType.UNLOAD,
            VehicleInventoryEventType.SALE,
        )
        if self.event_type in positive_types and self.quantity <= 0:
            raise BadRequestError(f"quantity must be positive for event_type '{self.event_type.value}'")
        return self


class VehicleInventoryEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_by_uuid: Optional[str] = None
    vehicle_inventory_uuid: str
    material_uuid: str
    event_type: VehicleInventoryEventType
    quantity: float
    cost_per_unit: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    is_deleted: bool
    created_at: datetime


class VehicleInventoryEventListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uuid: Optional[str] = None
    vehicle_inventory_uuid: Optional[str] = None
    event_type: Optional[VehicleInventoryEventType] = None
    start_date: Optional[datetime] = Field(None, description="On or after this datetime")
    end_date: Optional[datetime] = Field(None, description="On or before this datetime")
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)


class VehicleInventoryEventPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: List[VehicleInventoryEventRead]
    total_count: int
    page: int
    per_page: int
    pages: int
