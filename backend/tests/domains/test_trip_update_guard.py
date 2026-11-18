"""What PUT /trip/<uuid> may change (QA TRP-2).

The endpoint applied every field it was sent, so anyone allowed to call it could
complete a trip without the open-stop check, swap its vehicle, or move its times,
on any trip including audited ones. Only the trip's name and notes are editable
here; status goes through the finish and cancel flows, and an audited trip is
locked until its audit is undone.
"""
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.domains.trip.domain import TripDomain
from app.dto.trip import TripUpdate
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import Trip

TRIP_UUID = "trip-1"


def make_trip(audited: bool) -> Trip:
    trip = Trip(uuid=TRIP_UUID, name="ابومحمد-07-11-2026", notes=None, is_deleted=False)
    trip.audited_at = datetime(2026, 11, 8, 9, 0) if audited else None
    return trip


class _Repo:
    def __init__(self, trip):
        self.trip = trip

    def find_one(self, **_kwargs):
        return self.trip

    def save(self, model, commit=False):
        pass


class _Uow:
    def __init__(self, trip):
        self.trip_repository = _Repo(trip)


@pytest.fixture(autouse=True)
def _read_without_columns(monkeypatch):
    monkeypatch.setattr("app.domains.trip.domain.TripRead.from_orm", staticmethod(lambda t: t))


@pytest.mark.parametrize(
    "field, value",
    [
        ("status", "completed"),
        ("vehicle_uuid", "veh-2"),
        ("start_time", "2026-11-01T00:00:00Z"),
        ("end_time", "2026-11-01T00:00:00Z"),
        ("start_warehouse_uuid", "wh-2"),
        ("data", {}),
        ("service_area_uuid", "sa-1"),
    ],
)
def test_fields_outside_name_and_notes_are_refused(field, value):
    with pytest.raises(ValidationError):
        TripUpdate(**{field: value})


def test_name_and_notes_can_be_edited():
    trip = make_trip(audited=False)

    TripDomain.update_trip(uow=_Uow(trip), uuid=TRIP_UUID, payload=TripUpdate(name="Route A", notes="late start"))

    assert (trip.name, trip.notes) == ("Route A", "late start"), (trip.name, trip.notes)


def test_an_audited_trip_cannot_be_edited():
    trip = make_trip(audited=True)

    with pytest.raises(BadRequestError):
        TripDomain.update_trip(uow=_Uow(trip), uuid=TRIP_UUID, payload=TripUpdate(name="Route A"))

    assert trip.name == "ابومحمد-07-11-2026", trip.name
