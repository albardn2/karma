from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProcessTemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    type: str
    notes: Optional[str] = None
    data: dict = Field(default_factory=dict)


class ProcessTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    name: str
    type: str
    notes: Optional[str] = None
    data: Optional[dict] = None
    is_deleted: bool


class ProcessTemplateListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)


class ProcessTemplatePage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: List[ProcessTemplateRead]
    total_count: int
    page: int
    per_page: int
    pages: int
