from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency

class FinancialAccountBase(BaseModel):
    account_name: str
    balance: float
    currency: Currency
    notes: Optional[str] = None

class FinancialAccountCreate(FinancialAccountBase):
    """Fields required to create a new financial account."""
    created_by_uuid: Optional[str] = None

class FinancialAccountUpdate(BaseModel):
    """All fields optional for partial updates."""
    account_name: Optional[str]   = None
    balance:      Optional[float] = None
    currency:     Optional[Currency] = None
    notes:        Optional[str]   = None
    is_deleted:   Optional[bool]   = None

class FinancialAccountRead(FinancialAccountBase):
    model_config = ConfigDict(from_attributes=True)

    uuid:            str
    created_by_uuid: Optional[str] = None
    created_at:      datetime
    is_deleted:      bool

class FinancialAccountListParams(BaseModel):
    """Pagination parameters for listing financial accounts."""
    page:     int = Field(1, gt=0, description="Page number (>=1)")
    per_page: int = Field(20, gt=0, le=100, description="Items per page (<=100)")

class FinancialAccountPage(BaseModel):
    """Paginated financial account list response."""
    model_config = ConfigDict()

    accounts:    List[FinancialAccountRead] = Field(..., description="Accounts on this page")
    total_count: int                       = Field(..., description="Total number of accounts")
    page:        int                       = Field(..., description="Current page number")
    per_page:    int                       = Field(..., description="Number of items per page")
    pages:       int                       = Field(..., description="Total pages available")