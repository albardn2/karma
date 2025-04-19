from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime

class MaterialBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    unit: Optional[str] = None
    sku: str
    description: Optional[str] = None
    type: str

class MaterialCreate(MaterialBase):
    """Fields required to create a new Material."""
    name: str
    sku: str
    type: str

class MaterialUpdate(BaseModel):
    """All fields optional for partial updates."""
    name: Optional[str] = None
    unit: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None

class MaterialRead(MaterialBase):
    """What we return to clients."""
    uuid: UUID
    created_at: datetime

    class Config:
        orm_mode = True

class MaterialReadList(BaseModel):
    """List + count for GET /"""
    materials: list[MaterialRead]
    total_count: int

    class Config:
        orm_mode = True
