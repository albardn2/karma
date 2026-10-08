from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class OperatorType(str, Enum):

    IO_PROCESS_OPERATOR = "io_process_operator"
    MATERIAL_REFILL_OPERATOR = "material_refill_operator"
    QC_OPERATOR = "qc_operator"
    TRIP_OPERATOR = "trip_operator"
    TRIP_STOP_OPERATOR = "trip_stop_operator"
    INVENTORY_DUMP_OPERATOR = "inventory_dump_operator"
    NOOP_OPERATOR = "noop_operator"
    START_TRIP_OPERATOR = "start_trip_operator"
    TRIP_ADD_INVENTORY_OPERATOR = "trip_add_inventory_operator"
    TRIP_ROUTE_OPERATOR = "trip_route_operator"
    TRIP_CREATE_OPERATOR = "trip_create_operator"
    TRIP_FINISH_OPERATOR = "trip_finish_operator"


# Base DTO for TaskExecution
class TaskExecutionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str  # e.g., in_progress, completed, failed
    result: Optional[Dict[str, Any]] = {}  # Store results as a dictionary
    error_message: Optional[str] = None  # Error message, if any
    start_time: Optional[datetime] = None  # Start time of the execution
    end_time: Optional[datetime] = None  # End time of the execution
    depends_on: Optional[List[str]] = []  # List of task_execution_uuids this execution depends on

# DTO for creating a new TaskExecution
class TaskExecutionCreate(TaskExecutionBase):
    model_config = ConfigDict(extra="forbid")

    task_uuid: str  # str of the task this execution belongs to
    workflow_execution_uuid: str  # str of the workflow execution
    created_by_uuid: Optional[str] = None  # str of the user who created the execution
    parent_task_execution_uuid: Optional[str] = None  # Optional parent task execution if this is a child

# DTO for updating a TaskExecution
class TaskExecutionUpdate(TaskExecutionBase):
    model_config = ConfigDict(extra="forbid")

    status: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    depends_on: Optional[List[str]] = None

# DTO for reading a TaskExecution
class TaskExecutionRead(TaskExecutionBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str  # str of the task execution
    task_uuid: str  # str of the associated task
    workflow_execution_uuid: str  # str of the associated workflow execution
    created_by_uuid: Optional[str] = None  # str of the user who created the execution
    created_at: datetime  # Time when the task execution was created
    parent_task_execution_uuid: Optional[str] = None  # Parent task execution str if this is a child task
    name: Optional[str] = None  # Name of the task execution, if applicable
    operator: Optional[str] = None  # Operator of the underlying task
    result : Optional[Dict[str, Any]] = Field(default_factory=dict)  # Ensure result is always a dict


# DTO for pagination and filtering when listing TaskExecutions
class TaskExecutionListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    task_uuid: Optional[str] = None  # Filter by task str
    workflow_execution_uuid: Optional[str] = None  # Filter by workflow execution str
    parent_task_execution_uuid: Optional[str] = None  # Filter by parent task execution str
    status: Optional[str] = None  # Filter by execution status (e.g., in_progress, completed)
    created_by_uuid: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    name: Optional[str] = None  # Filter by task execution name

    page: int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

# DTO for a paginated list of TaskExecutions
class TaskExecutionPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_executions: List[TaskExecutionRead] = Field(..., description="TaskExecutions on this page")
    total_count: int = Field(..., description="Total number of task executions")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total pages available")


class TaskExecutionComplete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed_by_uuid: Optional[str] = None  # UUID of the user completing the task execution
    uuid: str  # UUID of the task execution to complete
    result: Optional[Dict[str, Any]] = {}  # Result data to store

# --------------------------------------------------------------------------
# The setup form's strategy pool preview: how many customers each of the
# picked strategy's priorities matches RIGHT NOW, for the service areas
# ticked on the form. Counts only — deliberately NOT the <Resource>Page
# shape, because there is no items array and nothing to paginate.


class StrategyPoolPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # the strategy NAME exactly as the form holds it. Never pre-lowered:
    # find_by_name_ci is the only case-folding authority.
    strategy: str = Field(..., min_length=1, max_length=64)
    # service area NAMES. [] means EVERYWHERE (the whole tenant), matching
    # the route step's polygon=None — it does not mean "nowhere".
    service_areas: List[str] = Field(default_factory=list, max_length=500)


class StrategyPriorityPoolCount(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 0-based, == config.priorities[index]; a priority has no name field
    index: int = Field(..., ge=0)
    count: int = Field(..., ge=0)
    # echoed so the row's own cap is visible without the preview simulating
    # it — simulating would be the selection logic a preview must not run
    max_stops: Optional[int] = None


class StrategyPoolPreviewRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # False (with 200, never 400) for manual/legacy_cluster: a debounced
    # request can land after the dispatcher switches to manual, and a red
    # error on a correct selection is exactly what this must not add
    applicable: bool
    # customers eligible at all in these areas, before any priority filter —
    # the denominator that separates "empty areas" from "narrow strategy"
    eligible_pool: int = Field(..., ge=0)
    # deduped union across priorities: a hard ceiling on what a run can pick
    total: int = Field(..., ge=0)
    priorities: List[StrategyPriorityPoolCount] = Field(default_factory=list)
    # sum(counts) > total; computed here so the copy has one source of truth
    overlaps: bool = False
    unmatched_service_areas: List[str] = Field(default_factory=list)
