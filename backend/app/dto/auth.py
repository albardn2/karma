from enum import Enum

import pydantic
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from app.entrypoint.routes.common.errors import BadRequestError


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
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    language: Optional[str] = None
    rfid_token: Optional[str] = None  # RFID token for user identification

    @pydantic.model_validator(mode="after")
    def username_not_email(cls, values):
        username = values.username
        # crude check – you can tighten this regex if you like
        if "@" in username:
            raise ValueError("username must not be an email address")
        return values


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    language: Optional[str] = None
    password: Optional[str] = None
    rfid_token: Optional[str] = None  # RFID token for user identification
    # only admins may change this:
    permission_scope: Optional[PermissionScope] = None

class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username_or_email: Optional[str] = None
    password: Optional[str] = None
    rfid_token: Optional[str] = None

    @pydantic.model_validator(mode="after")
    def check_credentials(cls, values):
        if not values.username_or_email and not values.rfid_token:
            raise BadRequestError("Either username_or_email or rfid_token must be provided")
        if values.username_or_email and values.rfid_token:
            raise BadRequestError("Only one of username_or_email or rfid_token should be provided")
        return values


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


