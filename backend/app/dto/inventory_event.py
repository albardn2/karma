from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.common_enums import Currency


class InventoryEventType(str, Enum):
    PURCHASE_ORDER = "purchase_order"
    PROCESS = "process"
    SALE = "sale"
    TRANSFER = "transfer"
    RETURN = "return"
    ADJUSTMENT = "adjustment"
    MANUAL = "manual"




class InventoryEventBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    inventory_uuid: str
    purchase_order_item_uuid: Optional[str] = None
    process_uuid: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    event_type: InventoryEventType
    quantity: float
    notes: Optional[str] = None
    debit_note_item_uuid: Optional[str] = None
    credit_note_item_uuid: Optional[str] = None
    cost_per_unit: Optional[float] = None
    currency: Optional[Currency] = None
    affect_original:bool

class InventoryEventCreate(InventoryEventBase):
    """Fields required to create a new inventory event."""
    pass

    @model_validator(mode="before")
    @classmethod
    def check_exclusive_fields(cls, values: dict) -> dict:
        po = bool(values.get("purchase_order_item_uuid"))
        co = bool(values.get("customer_order_item_uuid"))
        process = bool(values.get("process_uuid"))
        cpu = bool(values.get("cost_per_unit"))
        currency = bool(values.get("currency"))
        is_manual = bool(values.get("event_type") == InventoryEventType.MANUAL.value)

        if not (po or co or process or (cpu and currency)):
            raise BadRequestError("At least one of purchase_order_item_uuid, customer_order_item_uuid, process_uuid, cost_per_unit and currency must be set.")
        if (po + co + process + cpu) > 1:
            raise BadRequestError("Only one of purchase_order_item_uuid, customer_order_item_uuid, debit_note_item_uuid, credit_note_item_uuid or process_uuid can be set.")

        if cpu and (not is_manual or not currency):
            raise BadRequestError("cost_per_unit and currency must be set if event_type is MANUAL.")
        return values


class InventoryEventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cost_per_unit: Optional[float] = None
    currency: Optional[Currency] = None
    affect_original:Optional[bool] = None
    quantity: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None


class InventoryEventRead(InventoryEventBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    material_uuid: str
    created_at: datetime
    is_deleted: bool


class InventoryEventListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_uuid: Optional[str] = None
    purchase_order_item_uuid: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    debit_note_item_uuid: Optional[str] = None
    credit_note_item_uuid: Optional[str] = None
    process_uuid: Optional[str] = None
    event_type: Optional[InventoryEventType] = None
    start_date: Optional[datetime] = Field(None, description="On or after this datetime")
    end_date:   Optional[datetime] = Field(None, description="On or before this datetime")
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)


class InventoryEventPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: List[InventoryEventRead]
    total_count: int
    page: int
    per_page: int
    pages: int