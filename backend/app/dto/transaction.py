## app/dto/transaction.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

from app.dto.common_enums import Currency

class TransactionBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: float
    currency: Currency
    from_account_uuid: str | None = None
    to_account_uuid:   str | None = None
    exchange_rate: float = Field(1.0, gt=0)
    notes: Optional[str] = None

class TransactionCreate(TransactionBase):
    """Fields required to create a new transaction."""
    created_by_uuid: str | None = None

class TransactionUpdate(BaseModel):
    """All fields optional for partial updates."""
    model_config = ConfigDict(extra="forbid")

    notes:              Optional[str]    = None

class TransactionRead(TransactionBase):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    uuid:            str
    created_by_uuid: Optional[str] = None
    created_at:      datetime
    is_deleted:      bool

class TransactionListParams(BaseModel):
    """Optional filters plus pagination for listing transactions."""
    model_config = ConfigDict(extra="forbid")

    from_account_uuid: Optional[str] = None
    to_account_uuid:   Optional[str] = None
    start_date:        Optional[datetime] = Field(
        None, description="Filter on or after this datetime"
    )
    end_date:          Optional[datetime] = Field(
        None, description="Filter on or before this datetime"
    )
    page:     int  = Field(1, gt=0, description="Page number (>=1)")
    per_page: int  = Field(20, gt=0, le=100, description="Items per page (<=100)")

class TransactionPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transactions: List[TransactionRead] = Field(..., description="Transactions on this page")
    total_count:  int                   = Field(..., description="Total number of transactions")
    page:         int                   = Field(..., description="Current page number")
    per_page:     int                   = Field(..., description="Number of items per page")
    pages:        int                   = Field(..., description="Total pages available")