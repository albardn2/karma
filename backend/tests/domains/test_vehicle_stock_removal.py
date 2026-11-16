"""Taking a material off a vehicle, and deleting a vehicle that still holds stock (QA FLT-V4).

A vehicle's stock line cannot be deleted once it has movements, which every real line
has, so the only way to take a material off a van is to unload what is left and
deactivate the line. Deleting the vehicle itself must not leave stock orphaned under a
vehicle that no longer exists.
"""
from datetime import datetime

import pytest

from app.domains.vehicle.domain import VehicleDomain
from app.domains.vehicle_inventory.domain import VehicleInventoryDomain
from app.dto.vehicle_inventory_event import VehicleInventoryEventType
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import Vehicle as VehicleModel
from models.common import VehicleInventory as VehicleInventoryModel
from models.common import VehicleInventoryEvent as VehicleInventoryEventModel

VEHICLE_UUID = "veh-1"
LINE_UUID = "line-1"
USER_UUID = "user-1"
ON_BOARD = 25.0


def make_line(balance: float) -> VehicleInventoryModel:
    line = VehicleInventoryModel(
        uuid=LINE_UUID, vehicle_uuid=VEHICLE_UUID, material_uuid="mat-1", is_active=True, is_deleted=False
    )
    if balance:
        line.events = [VehicleInventoryEventModel(quantity=balance, is_deleted=False)]
    return line


class _Repo:
    def __init__(self, rows=()):
        self.rows = list(rows)
        self.saved = []

    def find_one(self, **kwargs):
        return next((r for r in self.rows if r.uuid == kwargs.get("uuid")), None)

    def find_all(self, **kwargs):
        return [r for r in self.rows if all(getattr(r, k) == v for k, v in kwargs.items())]

    def save(self, model, commit=False):
        # the real repository flushes on save, which fills the column defaults in
        for column, value in (("uuid", f"saved-{len(self.saved)}"), ("is_deleted", False), ("created_at", datetime(2026, 11, 16))):
            if getattr(model, column, None) is None:
                setattr(model, column, value)
        self.saved.append(model)


class _Uow:
    def __init__(self, lines=(), vehicle=None):
        self.vehicle_inventory_repository = _Repo(lines)
        self.vehicle_inventory_event_repository = _Repo()
        self.vehicle_repository = _Repo([vehicle] if vehicle else [])


def test_removing_a_line_unloads_what_is_left_and_deactivates_it():
    line = make_line(ON_BOARD)
    uow = _Uow(lines=[line])

    VehicleInventoryDomain.remove_line(uow=uow, uuid=LINE_UUID, user_uuid=USER_UUID)

    events = uow.vehicle_inventory_event_repository.saved
    assert len(events) == 1, events
    assert events[0].event_type == VehicleInventoryEventType.UNLOAD.value, events[0].event_type
    assert events[0].quantity == -ON_BOARD, events[0].quantity
    assert line.is_active is False, line.is_active


def test_removing_an_empty_line_only_deactivates_it():
    line = make_line(0)
    uow = _Uow(lines=[line])

    VehicleInventoryDomain.remove_line(uow=uow, uuid=LINE_UUID, user_uuid=USER_UUID)

    assert uow.vehicle_inventory_event_repository.saved == [], uow.vehicle_inventory_event_repository.saved
    assert line.is_active is False, line.is_active


def test_removing_an_overdrawn_line_is_refused():
    line = make_line(-5)
    uow = _Uow(lines=[line])

    with pytest.raises(BadRequestError):
        VehicleInventoryDomain.remove_line(uow=uow, uuid=LINE_UUID, user_uuid=USER_UUID)

    assert line.is_active is True, line.is_active


def _vehicle() -> VehicleModel:
    return VehicleModel(uuid=VEHICLE_UUID, plate_number="ABC-1", is_deleted=False)


def test_deleting_a_vehicle_that_still_holds_stock_is_refused():
    vehicle = _vehicle()
    uow = _Uow(lines=[make_line(ON_BOARD)], vehicle=vehicle)

    with pytest.raises(BadRequestError):
        VehicleDomain.delete_vehicle(uow=uow, uuid=VEHICLE_UUID)

    assert vehicle.is_deleted is False, vehicle.is_deleted


def test_deleting_a_vehicle_whose_lines_are_empty_is_allowed(monkeypatch):
    vehicle = _vehicle()
    uow = _Uow(lines=[make_line(0)], vehicle=vehicle)
    # VehicleRead needs columns these tests never flush; the guard is what's under test
    monkeypatch.setattr("app.domains.vehicle.domain.VehicleRead.from_orm", staticmethod(lambda v: v))

    VehicleDomain.delete_vehicle(uow=uow, uuid=VEHICLE_UUID)

    assert vehicle.is_deleted is True, vehicle.is_deleted
