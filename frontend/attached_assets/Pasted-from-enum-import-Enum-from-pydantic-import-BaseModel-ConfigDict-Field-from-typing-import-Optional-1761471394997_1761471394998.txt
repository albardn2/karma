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