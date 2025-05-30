from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Union
from uuid import UUID
from datetime import datetime
from app.dto.task_execution import OperatorType


class FieldType(str, Enum):
    TEXT = 'text'
    NUMBER = 'number'
    EMAIL = 'email'
    PASSWORD = 'password'
    BUTTON = 'button'
    FILE_UPLOAD = 'file_upload'
    CHECKLIST = 'checklist'
    RADIO = 'radio'
    DATE = 'date'
    TIME = 'time'
    SELECT = 'select'  # Added dropdown (select) type

# Base model for each task input field
class TaskInputField(BaseModel):
    name: str  # Field name
    label: str  # Field label for rendering
    type: FieldType  # Type of the input (text, number, select, etc.)
    required: bool = False  # Whether the field is required
    placeholder: Optional[str] = None  # Placeholder text for the field
    min: Optional[Union[int, float]] = None  # Minimum value for number fields
    max: Optional[Union[int, float]] = None  # Maximum value for number fields
    options: Optional[List[str]] = None  # Options for select, checklist, or radio buttons
    button_text: Optional[str] = None  # For button type fields
    multiple: Optional[bool] = False  # For file upload (allow multiple files)
    accept: Optional[str] = None  # For file upload (file types)
    rows: Optional[int] = None  # For textarea fields, number of rows
    cols: Optional[int] = None  # For textarea fields, number of columns
    min_length: Optional[int] = None  # For text fields, min length
    max_length: Optional[int] = None  # For text fields, max length

class TaskInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inputs: List[TaskInputField] = []



# Common Base DTO for Task
class TaskBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: Optional[str] = None
    operator: OperatorType
    task_inputs: Optional[TaskInput] = None  # Representing the task inputs as a dictionary
    depends_on: Optional[List[str]] = []  # List of task names this task depends on
    callback_fns: Optional[List[str]] = None  # List of callback function names to be executed after task completion

# DTO for creating a new Task
class TaskCreate(TaskBase):
    model_config = ConfigDict(extra="forbid")

    created_by_uuid: Optional[str] = None
    workflow_uuid: str  # Workflow this task belongs to
    parent_task_uuid: Optional[str] = None  # Parent task if this is a child task

# DTO for partial updates to a Task
class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    description: Optional[str] = None
    operator: Optional[OperatorType] = None
    task_inputs: Optional[dict] = None # TODO: add dto for task inputs depending on opertor etc..
    depends_on: Optional[List[str]] = []  # List of task names this task depends on
    callback_fns: Optional[List[str]] = None  # List of callback function names to be executed after task completion

# DTO for reading a Task
class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid: str
    created_by_uuid: Optional[str] = None
    created_at: datetime
    workflow_uuid: str
    is_deleted: bool = False  # Indicates if the task is deleted
    parent_task_uuid: Optional[str] = None  # Parent task UUID if this is a child task

# DTO for pagination and filtering when listing Tasks
class TaskListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uuid: Optional[str] = None
    name: Optional[str] = None
    workflow_uuid: Optional[str] = None

    page: int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

# DTO for a paginated list of Tasks
class TaskPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tasks: List[TaskRead] = Field(..., description="Tasks on this page")
    total_count: int = Field(..., description="Total number of tasks")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of items per page")
    pages: int = Field(..., description="Total pages available")
