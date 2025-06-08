from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from app.dto.workflow import WorkflowTags
from app.dto.task_execution import TaskExecutionRead

class WorkflowStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


# Base DTO for WorkflowExecution
class WorkflowExecutionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: WorkflowStatus  # e.g. in_progress, completed, failed
    result: Optional[Dict[str, Any]] = {}  # Store results as a dictionary
    parameters: Optional[Dict[str, Any]] = {}  # Store parameters as a dictionary
    error_message: Optional[str] = None  # Error message, if any
    start_time: Optional[datetime] = None  # Start time of the execution
    end_time: Optional[datetime] = None  # End time of the execution


# DTO for creating a new WorkflowExecution
class WorkflowExecutionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_uuid: str  # UUID of the workflow that the execution belongs to
    parameters: Optional[Dict[str, Any]] = {}  # Store parameters as a dictionary
    created_by_uuid: Optional[str] = None  # Optional user who created the execution


# DTO for updating a WorkflowExecution
class WorkflowExecutionUpdate(WorkflowExecutionBase):
    model_config = ConfigDict(extra="forbid")

    status: Optional[WorkflowStatus] = None
    result: Optional[Dict[str, Any]] = None
    parameters: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


# DTO for reading a WorkflowExecution
class WorkflowExecutionRead(WorkflowExecutionBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str  # UUID of the workflow execution
    workflow_uuid: str  # UUID of the related workflow
    created_by_uuid: Optional[str] = None  # UUID of the user who created the execution
    created_at: datetime  # Time when the workflow execution was created
    tags : Optional[List[WorkflowTags]] = []  # Tags associated with the workflow execution
    name : Optional[str] = None  # Name of the workflow execution, if applicable
    task_executions: Optional[List[TaskExecutionRead]] = []  # List of task executions associated with this workflow execution


# DTO for pagination and filtering when listing WorkflowExecutions
class WorkflowExecutionListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    workflow_uuid: Optional[str] = None
    name: Optional[str] = None  # Filter by workflow execution name
    status: Optional[WorkflowStatus] = None  # Filter by execution status (e.g., in_progress, completed)
    created_by_uuid: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    tags : Optional[List[WorkflowTags]] = None  # Filter by tags associated with the workflow execution

    page: int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

class WorkflowExecutionPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_executions: List[WorkflowExecutionRead] = Field(..., description="WorkflowExecutions on this page")
    total_count: int = Field(..., description="Total number of workflow executions")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total pages available")
