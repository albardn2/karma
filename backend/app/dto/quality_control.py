# app/dto/quality_control.py

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

# You can expand this enum with more QC types as needed.
class QualityControlType(str, Enum):
    COATED_PEANUTS_QC = "coated_peanuts_qc"

class QualityControlBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid:    Optional[str]          = None
    process_uuid:       str                     = Field(..., description="UUID of the associated Process")
    type:               QualityControlType      = Field(..., description="Either 'quality_check' or 'inspection'")
    notes:              Optional[str]           = None
    data:               Optional[dict] = None

class QualityControlCreate(QualityControlBase):
    """Fields required to create a new QualityControl record."""
    model_config = ConfigDict(extra="forbid")

class QualityControlUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: Optional[str] = None
    data:  Optional[dict] = None

class QualityControlRead(QualityControlBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid:       str
    created_at: datetime
class QualityControlListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uuid:             Optional[str]                = None
    process_uuid:     Optional[str]                = None
    type:             Optional[QualityControlType]  = None
    created_by_uuid:  Optional[str]                = None
    start_date:       Optional[datetime]            = None
    end_date:         Optional[datetime]            = None
    page:             int     = Field(1, gt=0)
    per_page:         int     = Field(20, gt=0, le=100)

class QualityControlPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items:       List[QualityControlRead]
    total_count: int
    page:        int
    per_page:    int
    pages:       int
