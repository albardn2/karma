"""UTC timestamps on the wire (QA Phase 3.1).

Columns hold naive UTC. Sent without a zone, every client reads them as local time
and shows them shifted by the viewer's offset — hours wrong, and the wrong day around
midnight. These tests pin the wire format and the inbound normalisation.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest
from pydantic import BaseModel

from app.dto.utc_datetime import UtcDateTime
from app.utils.time_utils import utc_iso

NAIVE_UTC = datetime(2026, 11, 12, 3, 56, 0)
WIRE = "2026-11-12T03:56:00Z"
DAMASCUS = timezone(timedelta(hours=3))


class _Row(BaseModel):
    at: UtcDateTime
    maybe: Optional[UtcDateTime] = None


def test_naive_utc_serialises_with_z():
    dumped = _Row(at=NAIVE_UTC).model_dump(mode="json")
    assert dumped["at"] == WIRE, dumped


def test_none_stays_none():
    dumped = _Row(at=NAIVE_UTC, maybe=None).model_dump(mode="json")
    assert dumped["maybe"] is None, dumped


@pytest.mark.parametrize(
    "incoming",
    [WIRE, "2026-11-12T06:56:00+03:00", datetime(2026, 11, 12, 6, 56, tzinfo=DAMASCUS)],
)
def test_aware_input_becomes_naive_utc(incoming):
    """An aware value from a client compares correctly against naive UTC columns."""
    row = _Row(at=incoming)
    assert row.at == NAIVE_UTC, row.at
    assert row.at.tzinfo is None, row.at


def test_naive_input_is_taken_as_utc():
    row = _Row(at="2026-11-12T03:56:00")
    assert row.at == NAIVE_UTC, row.at


def test_python_mode_dump_keeps_a_datetime():
    """Only the JSON form changes; code that dumps to Python still gets a datetime."""
    dumped = _Row(at=NAIVE_UTC).model_dump()
    assert dumped["at"] == NAIVE_UTC, dumped


@pytest.mark.parametrize(
    "value, expected",
    [(NAIVE_UTC, WIRE), (datetime(2026, 11, 12, 6, 56, tzinfo=DAMASCUS), WIRE), (None, None)],
)
def test_utc_iso_helper(value, expected):
    assert utc_iso(value) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        (WIRE, NAIVE_UTC),
        ("2026-11-12T06:56:00+03:00", NAIVE_UTC),
        ("2026-11-12T03:56:00", NAIVE_UTC),
        ("2026-11-12", datetime(2026, 11, 12)),
    ],
)
def test_parse_client_iso_accepts_what_the_api_sends(raw, expected):
    """A client may send back a timestamp exactly as it received it, Z included."""
    from app.utils.time_utils import parse_client_iso

    assert parse_client_iso(raw) == expected


def test_analytics_parse_dt_accepts_z():
    from app.entrypoint.routes.common.analytics import parse_dt

    assert parse_dt(WIRE) == NAIVE_UTC


@pytest.mark.parametrize(
    "dto_path, field",
    [
        ("app.dto.invoice:InvoiceRead", "due_date"),
        ("app.dto.purchase_order:PurchaseOrderRead", "payout_due_date"),
        ("app.dto.inventory:InventoryRead", "expiration_date"),
    ],
)
def test_calendar_day_fields_are_sent_without_a_zone(dto_path, field):
    """A day the user picked must not move to the previous day west of UTC."""
    import importlib

    module, name = dto_path.split(":")
    model = getattr(importlib.import_module(module), name)
    row = model.model_construct(**{field: datetime(2026, 11, 15)})

    dumped = row.model_dump(mode="json", include={field}, warnings=False)

    assert dumped[field] == "2026-11-15T00:00:00", f"{name}.{field}: {dumped[field]}"


def test_timestamp_fields_are_sent_with_a_zone():
    """The counterpart: an ordinary timestamp on the same DTO does carry the Z."""
    from app.dto.purchase_order import PurchaseOrderRead

    row = PurchaseOrderRead.model_construct(created_at=NAIVE_UTC)

    dumped = row.model_dump(mode="json", include={"created_at"}, warnings=False)

    assert dumped["created_at"] == WIRE, dumped
