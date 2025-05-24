# app/dto/process.py
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, Any, Dict, List
from datetime import datetime
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.common_enums import UnitOfMeasure
from enum import Enum

class ProcessType(str, Enum):
    """Enumeration for process types."""
    COATED_PEANUT_BATCH = "coated_peanut_batch"
    FLOUR_STARCH_POWDER_PREPARATION = "coated_peanut_powder_preparation"
    WATER_DIXTRIN_SOLUTION_PREPARATION = "water_dextrin_solution_preparation"
    RAW_PEANUT_FILTER = "raw_peanut_filter"
    PALM_OIL_PREPARATION = "palm_oil_preparation"
    FRYER_FUEL_PREPARATION = "fryer_fuel_preparation"
    SPICES_PREPARATION = "spices_preparation"



class ProcessInputItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_uuid: str
    quantity: float
    cost_per_unit: Optional[float] = None



class InputsUsedItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventory_uuid: str
    quantity: float

class ProcessOutputItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inputs_used: List[InputsUsedItem]
    material_uuid: str
    quantity: float
    inventory_uuid: Optional[str] = None
    total_cost: Optional[float] = None
    cost_per_unit: Optional[float] = None


class ProcessData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inputs: List[ProcessInputItem]
    outputs: List[ProcessOutputItem]
    output_warehouse_uuid: Optional[str] = None

    @model_validator(mode="after")
    def check_duplicate_input_uuids(self) -> "ProcessData":
        seen = set()
        for inp in self.inputs:
            if inp.inventory_uuid in seen:
                raise BadRequestError("Duplicate inventory uuids found in inputs.")
            seen.add(inp.inventory_uuid)
        return self

    @model_validator(mode="after")
    def check_duplicate_output_uuids_and_materials(self) -> "ProcessData":
        seen_inv = set()
        seen_mat = set()
        for out in self.outputs:
            if out.inventory_uuid:
                if out.inventory_uuid in seen_inv:
                    raise BadRequestError("Duplicate inventory uuids found in outputs.")
                seen_inv.add(out.inventory_uuid)
            if out.material_uuid:
                if out.material_uuid in seen_mat:
                    raise BadRequestError("Duplicate material uuids found in outputs.")
                seen_mat.add(out.material_uuid)
        return self

    @model_validator(mode="after")
    def check_warehouse_for_untracked_outputs(self) -> "ProcessData":
        for output in self.outputs:
            for input_used in output.inputs_used:
                if input_used.inventory_uuid is None and self.warehouse_uuid is None:
                    raise BadRequestError(
                        "If input_used has None inventory_uuid, warehouse_uuid must be set."
                    )
        return self

    @model_validator(mode="after")
    def validate_input_used_is_equal_to_output(self) -> "ProcessData":
        used_by_inv: dict[str, float] = {}
        for out in self.outputs:
            for iu in out.inputs_used:
                used_by_inv[iu.inventory_uuid] = used_by_inv.get(iu.inventory_uuid, 0) + iu.quantity

        for inp in self.inputs:
            if inp.inventory_uuid not in used_by_inv:
                raise BadRequestError(f"Input {inp.inventory_uuid} not found in outputs.")
            if inp.quantity != used_by_inv[inp.inventory_uuid]:
                raise BadRequestError(
                    f"Input quantity {inp.quantity} does not match used quantity "
                    f"{used_by_inv[inp.inventory_uuid]} for inventory {inp.inventory_uuid}."
                )
        return self
class ProcessBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    type: ProcessType
    notes: Optional[str] = None
    data: ProcessData

class ProcessCreate(ProcessBase):
    """Fields required to create a new process."""
    model_config = ConfigDict(extra="forbid")

class ProcessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None

class ProcessRead(ProcessBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_deleted: bool

class ProcessListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Optional[ProcessType] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_by_uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class ProcessPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[ProcessRead]
    total_count: int
    page: int
    per_page: int
    pages: int