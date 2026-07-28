"""Marking a trip as audited, and taking it back.

An audit records WHO signed a trip off and WHEN, not just that someone did —
after the fact, "who" is usually the question. `Trip.is_audited` derives from
`audited_at` so the flag can never disagree with the record.

The two behaviours worth pinning:
  - marking an already-audited trip keeps the FIRST sign-off, so a stray second
    click cannot quietly reassign the audit to whoever clicked last;
  - un-auditing clears the timestamp and the auditor together, never one alone.
"""
from datetime import datetime

import pytest

from app.domains.trip.domain import TripDomain
from app.entrypoint.routes.common.errors import NotFoundError


class _Trip:
    def __init__(self, audited_at=None, audited_by_uuid=None):
        self.uuid = "11111111-1111-4111-8111-111111111111"
        self.audited_at = audited_at
        self.audited_by_uuid = audited_by_uuid
        self.is_deleted = False
        # the fields TripRead needs to serialise
        self.created_at = datetime(2026, 7, 1, 9, 0, 0)
        self.created_by_uuid = None
        self.vehicle_uuid = "22222222-2222-4222-8222-222222222222"
        self.status = "completed"
        self.notes = None
        self.distribution_area = None
        self.start_warehouse_uuid = None
        self.end_warehouse_uuid = None
        self.start_time = None
        self.end_time = None
        self.start_point = None
        self.end_point = None
        self.data = None
        self.workflow_execution_uuid = None
        self.start_inventory = None
        self.end_inventory = None
        self.service_area_uuid = None
        self.vehicle = None
        self.inventory_reconciliation = None
        self.expected_cash = None
        self.trip_expenses = None
        self.net_expected_cash = None

    @property
    def is_audited(self):
        return self.audited_at is not None


class _Repo:
    def __init__(self, trip):
        self._trip = trip
        self.saves = 0

    def find_one(self, **_kwargs):
        return self._trip

    def save(self, model, commit=False):
        self.saves += 1


class _Uow:
    def __init__(self, trip):
        self.trip_repository = _Repo(trip)


AUDITOR = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"


def test_marking_records_who_and_when():
    trip = _Trip()
    read = TripDomain.set_audited(uow=_Uow(trip), uuid=trip.uuid, audited=True,
                                  audited_by_uuid=AUDITOR)
    assert read.is_audited is True
    assert trip.audited_by_uuid == AUDITOR
    assert trip.audited_at is not None


def test_marking_twice_keeps_the_first_sign_off():
    """A second click must not reassign the audit to whoever clicked last."""
    first_at = datetime(2026, 7, 20, 8, 30, 0)
    trip = _Trip(audited_at=first_at, audited_by_uuid=AUDITOR)
    TripDomain.set_audited(uow=_Uow(trip), uuid=trip.uuid, audited=True,
                           audited_by_uuid=OTHER)
    assert trip.audited_at == first_at
    assert trip.audited_by_uuid == AUDITOR


def test_unauditing_clears_who_and_when_together():
    trip = _Trip(audited_at=datetime(2026, 7, 20, 8, 30, 0), audited_by_uuid=AUDITOR)
    read = TripDomain.set_audited(uow=_Uow(trip), uuid=trip.uuid, audited=False)
    assert read.is_audited is False
    assert trip.audited_at is None
    assert trip.audited_by_uuid is None


def test_unauditing_an_unaudited_trip_is_harmless():
    trip = _Trip()
    read = TripDomain.set_audited(uow=_Uow(trip), uuid=trip.uuid, audited=False)
    assert read.is_audited is False


def test_re_auditing_after_undo_records_the_new_auditor():
    """Once the sign-off is taken back, the next one is a fresh record."""
    trip = _Trip(audited_at=datetime(2026, 7, 20, 8, 30, 0), audited_by_uuid=AUDITOR)
    TripDomain.set_audited(uow=_Uow(trip), uuid=trip.uuid, audited=False)
    TripDomain.set_audited(uow=_Uow(trip), uuid=trip.uuid, audited=True,
                           audited_by_uuid=OTHER)
    assert trip.audited_by_uuid == OTHER


def test_unknown_trip_is_not_found():
    with pytest.raises(NotFoundError, match="Trip not found"):
        TripDomain.set_audited(uow=_Uow(None), uuid="nope", audited=True,
                               audited_by_uuid=AUDITOR)
