from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Union
from uuid import UUID
from datetime import datetime
from app.dto.task_execution import OperatorType

from app.dto.customer import CustomerCategory


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

    # default emptylist
    fields: List[TaskInputField] = Field(default_factory=list)
    data: Optional[dict] = None


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
    workflow_uuid: Optional[str] = None  # Workflow this task belongs to
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
    workflow_uuid: Optional[str] = None  # Workflow this task belongs to
    is_deleted: bool = False  # Indicates if the task is deleted
    parent_task_uuid: Optional[str] = None  # Parent task UUID if this is a child task


    @classmethod
    def from_orm_with_enrichment(cls, task, uow):
        # Custom from_orm to handle task_inputs deserialization
        obj = cls.from_orm(task)
        if obj.task_inputs:
            for f in obj.task_inputs.fields:
                if f.label == "service_areas":
                    service_areas = uow.service_area_repository.find_all(is_deleted=False)
                    f.options = [sa.name for sa in service_areas]
                if f.label == "assigned_user_uuid":
                    users = uow.user_repository.find_all(is_deleted=False)
                    f.options = [user.first_name for user in users]
                if f.label == "customer_categories":
                    categories = [category.value for category in CustomerCategory]
                    f.options = categories
                if f.label == "vehicle_plate":
                    vehicles = uow.vehicle_repository.find_all(is_deleted=False)
                    f.options = [vehicle.plate_number for vehicle in vehicles]
                if f.label == "start_warehouse_name":
                    warehouses = uow.warehouse_repository.find_all(is_deleted=False)
                    f.options = [wh.name for wh in warehouses]
                if f.label == "end_warehouse_name":
                    warehouses = uow.warehouse_repository.find_all(is_deleted=False)
                    f.options = [wh.name for wh in warehouses]
        return obj

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
