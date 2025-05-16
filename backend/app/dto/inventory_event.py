from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, List
from datetime import datetime

from app.entrypoint.routes.common.errors import BadRequestError


class InventoryEventType(str, Enum):
    PURCHASE_ORDER = "purchase_order"
    PROCESS = "process"
    SALE = "sale"
    TRANSFER = "transfer"
    RETURN = "return"
    ADJUSTMENT = "adjustment"



class InventoryEventBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    inventory_uuid: Optional[str] = str
    purchase_order_item_uuid: Optional[str] = None
    process_uuid: Optional[str] = None
    customer_order_item_uuid: Optional[str] = None
    event_type: InventoryEventType
    quantity: float
    notes: Optional[str] = None
    debit_note_item_uuid: Optional[str] = None
    credit_note_item_uuid: Optional[str] = None


class InventoryEventCreate(InventoryEventBase):
    """Fields required to create a new inventory event."""
    pass

    @model_validator(mode="before")
    @classmethod
    def check_exclusive_fields(cls, values: dict) -> dict:
        po = bool(values.get("purchase_order_item_uuid"))
        co = bool(values.get("customer_order_item_uuid"))
        dn = bool(values.get("debit_note_item_uuid"))
        cn = bool(values.get("credit_note_item_uuid"))
        process = bool(values.get("process_uuid"))
        if not (po or co or process):
            raise BadRequestError("At least one of purchase_order_item_uuid, customer_order_item_uuid, debit_note_item_uuid, credit_note_item_uuid or process_uuid must be set.")
        if (po + co + process) > 1:
            raise BadRequestError("Only one of purchase_order_item_uuid, customer_order_item_uuid, debit_note_item_uuid, credit_note_item_uuid or process_uuid can be set.")

        return values




class InventoryEventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_type: Optional[InventoryEventType] = None
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