# app/dto/process.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Any, Dict, List
from datetime import datetime
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.common_enums import UnitOfMeasure
from enum import Enum

class ProcessType(str, Enum):
    """Enumeration for process types."""
    COATED_PEANUT_BATCH = "coated_peanut_batch"
    COATED_PEANUT_POWDER_PREPARATION = "coated_peanut_powder_preparation"
    RAW_PEANUT_FILTER = "raw_peanut_filter"

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
    total_cost: Optional[float] = None




class ProcessData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inputs: List[ProcessInputItem]
    outputs: List[ProcessOutputItem]


class ProcessBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    type: ProcessType
    notes: Optional[str] = None
    data: ProcessData

class ProcessCreate(ProcessBase):
    """Fields required to create a new process."""
    pass

class ProcessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None
    data: Optional[ProcessData] = None

class ProcessRead(ProcessBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_at: datetime
    is_deleted: bool

class ProcessListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Optional[ProcessType] = None
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