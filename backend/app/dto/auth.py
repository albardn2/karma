from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class PermissionScope(str, Enum):
    SUPER_ADMIN = "superuser"
    ADMIN = "admin"
    OPERATION_MANAGER = "operation_manager"
    ACCOUNTANT = "accountant"
    OPERATOR = "operator"
    DRIVER = "driver"
    SALES = "sales"

class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str
    first_name: str
    last_name: str
    password: str
    permission_scope: Optional[PermissionScope] = PermissionScope.OPERATOR.value
    email: Optional[str] = None
    phone_number: Optional[str] = None
    language: Optional[str] = None

class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    language: Optional[str] = None
    password: Optional[str] = None
    # only admins may change this:
    permission_scope: Optional[PermissionScope] = None

class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    access_token: str
    refresh_token: str

class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    username: str
    first_name: str
    last_name: str
    email: Optional[str]
    phone_number: Optional[str]
    language: Optional[str]
    created_at: datetime
    permission_scope: Optional[PermissionScope]
    is_deleted: bool


class UserListParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Optional[str] = None
    email: Optional[str] = None
    permission_scope: Optional[PermissionScope] = None
    phone_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    uuid: Optional[str] = None
    page: int = Field(1, gt=0)
    per_page: int = Field(20, gt=0, le=100)

class UserPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    users: List[UserRead]
    total_count: int
    page: int
    per_page: int
    pages: int


