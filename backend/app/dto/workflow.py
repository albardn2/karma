from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class WorkflowTags(str, Enum):
    """Enumeration for process types."""
    COATED_PEANUTS = "coated_peanuts"
    DISTRIBUTION = "distribution"


class WorkflowBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: Optional[str] = None
    tags: Optional[List[WorkflowTags]] = None

# DTO for creating a new Workflow
class WorkflowCreate(WorkflowBase):
    model_config = ConfigDict(extra="forbid")
    created_by_uuid: Optional[str] = None

# DTO for partial updates to a Workflow
class WorkflowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None

# DTO for reading a Workflow
class WorkflowRead(WorkflowBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    is_deleted: bool = False

# DTO for pagination and filtering when listing Workflows
class WorkflowListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uuid: Optional[str] = None
    name: Optional[str] = None
    tags: Optional[List[WorkflowTags]] = None

    page: int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

# DTO for a paginated list of Workflows
class WorkflowPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflows: List[WorkflowRead] = Field(..., description="Workflows on this page")
    total_count: int = Field(..., description="Total number of workflows")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total pages available")