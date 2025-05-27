from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime

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

    task_uuid: UUID  # UUID of the task this execution belongs to
    workflow_execution_uuid: UUID  # UUID of the workflow execution
    created_by_uuid: Optional[UUID] = None  # UUID of the user who created the execution
    parent_task_execution_uuid: Optional[UUID] = None  # Optional parent task execution if this is a child

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

    uuid: UUID  # UUID of the task execution
    task_uuid: UUID  # UUID of the associated task
    workflow_execution_uuid: UUID  # UUID of the associated workflow execution
    created_by_uuid: Optional[UUID] = None  # UUID of the user who created the execution
    created_at: datetime  # Time when the task execution was created
    parent_task_execution_uuid: Optional[UUID] = None  # Parent task execution UUID if this is a child task

# DTO for pagination and filtering when listing TaskExecutions
class TaskExecutionListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[UUID] = None
    task_uuid: Optional[UUID] = None  # Filter by task UUID
    workflow_execution_uuid: Optional[UUID] = None  # Filter by workflow execution UUID
    status: Optional[str] = None  # Filter by execution status (e.g., in_progress, completed)
    created_by_uuid: Optional[UUID] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

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
