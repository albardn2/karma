"""An expense's vehicle: picked directly, or derived from its trip.

A standalone expense may name a vehicle (validated against the tenant). A trip
expense is associated to the trip's ASSIGNED vehicle — derived, never trusted
from the request, so an expense and its trip can never name different vehicles.
"""
import uuid as uuid_lib
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.domains.expense.domain import ExpenseDomain
from app.dto.expense import ExpenseCategory, ExpenseCreate
from app.entrypoint.routes.common.errors import NotFoundError


def _uow(trip=None, vehicle=None):
    uow = MagicMock()
    uow.trip_repository.find_one.return_value = trip
    uow.vehicle_repository.find_one.return_value = vehicle
    saved = {}

    def _save(model, commit=False):
        # mimic the flush-time defaults ExpenseRead.from_orm reads back
        if not getattr(model, "uuid", None):
            model.uuid = str(uuid_lib.uuid4())
        if not getattr(model, "created_at", None):
            model.created_at = datetime.utcnow()
        if getattr(model, "is_deleted", None) is None:
            model.is_deleted = False
        saved["model"] = model

    uow.expense_repository.save.side_effect = _save
    uow._saved = saved
    return uow


def _create(uow, **overrides):
    payload = ExpenseCreate(**{
        "amount": 100.0, "currency": "USD",
        "category": ExpenseCategory.MEALS.value,
        **overrides,
    })
    ExpenseDomain.create_expense(uow=uow, payload=payload)
    return uow._saved["model"]


def test_a_standalone_vehicle_is_validated_and_stored():
    veh = SimpleNamespace(uuid="veh-1", is_deleted=False)
    saved = _create(_uow(vehicle=veh), vehicle_uuid="veh-1")
    assert saved.vehicle_uuid == "veh-1"


def test_an_unknown_standalone_vehicle_is_refused():
    with pytest.raises(NotFoundError):
        _create(_uow(vehicle=None), vehicle_uuid="ghost")


def test_a_trip_expense_derives_the_trips_vehicle():
    trip = SimpleNamespace(uuid="trip-1", vehicle_uuid="trip-veh", is_deleted=False)
    saved = _create(_uow(trip=trip), trip_uuid="trip-1")
    assert saved.vehicle_uuid == "trip-veh"


def test_a_trip_expense_overrides_a_submitted_vehicle():
    """The trip's vehicle wins — a submitted one that disagrees is never trusted."""
    trip = SimpleNamespace(uuid="trip-1", vehicle_uuid="trip-veh", is_deleted=False)
    # vehicle_repository must NOT be consulted on the trip path
    uow = _uow(trip=trip)
    saved = _create(uow, trip_uuid="trip-1", vehicle_uuid="a-different-one")
    assert saved.vehicle_uuid == "trip-veh"
    uow.vehicle_repository.find_one.assert_not_called()


def test_no_vehicle_is_fine():
    saved = _create(_uow())
    assert saved.vehicle_uuid is None
