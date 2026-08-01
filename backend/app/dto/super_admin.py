from datetime import date, datetime
from typing import Optional, List

import pydantic
from pydantic import BaseModel, ConfigDict, Field

from app.dto.auth import UserPermissions


class AccountUpdate(BaseModel):
    """Platform-owner edits to a tenant account."""
    model_config = ConfigDict(extra="forbid")
    company_name: Optional[str] = Field(None, min_length=1, max_length=256)
    email: Optional[str] = None
    phone_number: Optional[str] = None
    is_blocked: Optional[bool] = None
    # The verification gate. Flipping this to true is what lets a new company
    # actually use the product; false puts it back behind the notice.
    is_verified: Optional[bool] = None
    subscription_rate: Optional[float] = Field(None, ge=0)
    subscription_currency: Optional[str] = Field(None, max_length=10)
    subscription_type: Optional[str] = None

    # tenant-wide feature cap (same schema as per-user permissions);
    # explicit null clears the cap (all features)
    permissions: Optional[UserPermissions] = None

    @pydantic.field_validator("subscription_type")
    def known_subscription_type(cls, v):
        if v is not None and v not in ("flat", "per_user"):
            raise ValueError("subscription_type must be flat or per_user")
        return v


class LedgerEntryCreate(BaseModel):
    """One subscription-ledger entry. Signs are normalized server-side:
    payment -> +|amount|, charge -> -|amount| (defaults to the account's
    monthly rate), adjustment -> amount as given (either sign)."""
    model_config = ConfigDict(extra="forbid")
    entry_type: str
    amount: Optional[float] = None
    currency: Optional[str] = Field(None, max_length=10)
    period: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")
    notes: Optional[str] = None
    # For a payment: the charge it settles, chosen from the account's unpaid list.
    # Left out for a payment received on account and not yet applied to a period.
    settles_charge_uuid: Optional[str] = None

    @pydantic.model_validator(mode="after")
    def validate_entry(cls, values):
        if values.entry_type not in ("payment", "charge", "adjustment"):
            raise ValueError("entry_type must be payment, charge or adjustment")
        if values.entry_type != "charge" and values.amount is None:
            raise ValueError("amount is required for payments and adjustments")
        if values.entry_type == "payment" and values.amount is not None and values.amount <= 0:
            raise ValueError("payment amount must be positive")
        # Only a payment settles a charge. The database enforces this too, but a 422
        # naming the field is a better answer than a 500 from a CHECK violation.
        if values.entry_type != "payment" and values.settles_charge_uuid:
            raise ValueError("only a payment can settle a charge")
        return values


class LedgerEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    account_uuid: str
    entry_type: str
    amount: float
    currency: str
    period: Optional[str]
    # the window a charge covers; null on payments and adjustments
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    # the charge a payment settles; null on charges, adjustments and
    # payments received on account but not yet applied
    settles_charge_uuid: Optional[str] = None
    # derived by the ledger route, not columns: a charge's settlement state, and the
    # period a payment settled so the row can name it instead of showing a uuid
    paid_amount: Optional[float] = None
    outstanding: Optional[float] = None
    is_paid: Optional[bool] = None
    settles_period: Optional[str] = None
    settles_period_start: Optional[date] = None
    settles_period_end: Optional[date] = None
    notes: Optional[str]
    created_by_uuid: Optional[str]
    created_at: datetime


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    uuid: str
    company_name: str
    email: Optional[str]
    phone_number: Optional[str]
    created_at: datetime
    is_deleted: bool
    is_blocked: bool
    is_verified: bool
    # when the account was admitted; also its billing anchor
    verified_at: Optional[datetime] = None
    subscription_rate: Optional[float]
    subscription_currency: Optional[str]
    subscription_type: Optional[str] = 'flat'
    permissions: Optional[dict] = None
    # enriched by the routes:
    user_count: Optional[int] = None
    balances: Optional[dict] = None  # {currency: signed sum}
