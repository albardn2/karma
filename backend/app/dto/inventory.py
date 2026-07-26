from pydantic import AliasChoices, AliasPath, BaseModel, ConfigDict, Field, model_validator
from app.entrypoint.routes.common.errors import BadRequestError
from typing import Optional, List
from datetime import datetime
from app.dto.common_enums import UnitOfMeasure, Currency

class InventoryBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    material_uuid: str
    warehouse_uuid: Optional[str] = None
    notes: Optional[str] = None
    lot_id: Optional[str] = None
    expiration_date: Optional[datetime] = None
    cost_per_unit: Optional[float] = Field(None)
    unit: UnitOfMeasure
    current_quantity: Optional[float] = Field(None)
    original_quantity: Optional[float] = Field(None)
    is_active: bool = True
    currency: Optional[Currency]  = None

class InventoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_uuid: str
    warehouse_uuid: str

    created_by_uuid: Optional[str] = None
    notes: Optional[str] = None
    lot_id: Optional[str] = None
    expiration_date: Optional[datetime] = None
    is_active: bool = True

class InventoryManualAdd(BaseModel):
    """Create a lot AND its opening quantity in one atomic request. Quantity on
    a lot only exists as inventory events, so a lot created without one is an
    invisible empty lot."""
    model_config = ConfigDict(extra="forbid")
    material_uuid: str
    warehouse_uuid: str
    quantity: float = Field(..., gt=0, description="Opening quantity, must be positive")
    notes: Optional[str] = None
    lot_id: Optional[str] = None
    expiration_date: Optional[datetime] = None
    cost_per_unit: Optional[float] = Field(None, ge=0)
    currency: Optional[Currency] = None

    @model_validator(mode="after")
    def check_cost_pair(self):
        # the inventory-event validator rejects a cost without a currency
        if (self.cost_per_unit is not None) and (self.currency is None):
            raise BadRequestError("currency is required when cost_per_unit is set")
        return self


class InventoryUpdate(BaseModel):
    """Fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")
    warehouse_uuid: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[datetime] = None
    is_active: Optional[bool] = None

class InventoryRead(InventoryBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_deleted: bool
    total_original_cost: Optional[float] = None
    material_name: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("material_name", AliasPath("material", "name")))

class InventoryListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid : Optional[str] = None
    material_uuid: Optional[str] = None
    warehouse_uuid: Optional[str] = None
    is_active: Optional[bool] = None
    currency: Optional[Currency] = None
    current_quantity: Optional[float] = None
    original_quantity: Optional[float] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class InventoryPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventories: List[InventoryRead]
    total_count: int
    page: int
    per_page: int
    pages: int


class InventoryFIFOOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_uuid: str
    material_uuid:str
    quantity: float

