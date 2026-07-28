"""When a van's stock ledger may and may not be changed.

A van can be overdrawn — trip sales are allowed to push it negative on purpose
(`record_trip_sale` passes allow_negative=True). Both guards here used to test
the RESULTING balance rather than whether the change made things worse, which
made an overdrawn van unrepairable:

  - loading 3 units onto a van at -10 was refused, because -10 + 3 is still
    negative, so the operator had to either not record what they loaded or type
    a number they knew was false (reproduced live: +3 and +7 refused, +10 taken);
  - deleting a sale was refused, because a sale is stored as a NEGATIVE delta and
    removing it raises the balance. Unfulfilling an order reverses the warehouse
    ledger first and lands here in the same transaction, so the whole unfulfil
    rolled back.

What stays refused: taking stock OUT that is not there. That is a different
mistake and the guard for it is intended.
"""
import pytest

from app.domains.vehicle_inventory_event.domain import VehicleInventoryEventDomain
from app.dto.vehicle_inventory_event import (
    VehicleInventoryEventCreate,
    VehicleInventoryEventType,
)
from app.entrypoint.routes.common.errors import BadRequestError

VI_UUID = "11111111-1111-4111-8111-111111111111"


class _Inventory:
    def __init__(self, balance):
        self.uuid = VI_UUID
        self.material_uuid = "mat-1"
        self.current_quantity = balance
        self.is_deleted = False


class _Event:
    def __init__(self, quantity):
        self.uuid = "22222222-2222-4222-8222-222222222222"
        self.vehicle_inventory_uuid = VI_UUID
        self.quantity = quantity
        self.is_deleted = False
        self.event_type = "manual"
        self.created_at = None
        self.material_uuid = "mat-1"
        self.customer_order_item_uuid = None
        self.trip_stop_uuid = None
        self.created_by_uuid = None
        self.notes = None


class _Repo:
    def __init__(self, row):
        self._row = row
        self.saved = []

    def find_one(self, **_kwargs):
        return self._row

    def save(self, model, commit=False):
        # stand in for the DB defaults a real flush would fill in, so the
        # domain's closing from_orm() has something to serialise
        from datetime import datetime
        if getattr(model, "uuid", None) is None:
            model.uuid = "33333333-3333-4333-8333-333333333333"
        if getattr(model, "is_deleted", None) is None:
            model.is_deleted = False
        if getattr(model, "created_at", None) is None:
            model.created_at = datetime(2026, 7, 28, 12, 0, 0)
        self.saved.append(model)


class _Uow:
    def __init__(self, balance, event=None):
        self.vehicle_inventory_repository = _Repo(_Inventory(balance))
        self.vehicle_inventory_event_repository = _Repo(event)


def _create(balance, event_type, quantity, allow_negative=False):
    uow = _Uow(balance)
    return VehicleInventoryEventDomain.create_event(
        uow=uow,
        payload=VehicleInventoryEventCreate(
            vehicle_inventory_uuid=VI_UUID, event_type=event_type, quantity=quantity
        ),
        allow_negative=allow_negative,
    )


# --- loading onto an overdrawn van ------------------------------------------

@pytest.mark.parametrize("quantity", [3, 7, 10, 500])
def test_loading_an_overdrawn_van_is_allowed(quantity):
    """A load can only improve the balance, whatever its size."""
    read = _create(-10, VehicleInventoryEventType.MANUAL, quantity)
    assert read.quantity == quantity


def test_upward_adjustment_of_an_overdrawn_van_is_allowed():
    read = _create(-10, VehicleInventoryEventType.ADJUSTMENT, 4)
    assert read.quantity == 4


# --- taking stock out that is not there stays refused -----------------------

def test_unloading_more_than_the_van_holds_is_still_refused():
    with pytest.raises(BadRequestError, match="Insufficient vehicle stock"):
        _create(10, VehicleInventoryEventType.UNLOAD, 25)


def test_unloading_from_an_overdrawn_van_is_still_refused():
    with pytest.raises(BadRequestError, match="Insufficient vehicle stock"):
        _create(-10, VehicleInventoryEventType.UNLOAD, 5)


def test_downward_adjustment_below_zero_is_still_refused():
    with pytest.raises(BadRequestError, match="Insufficient vehicle stock"):
        _create(5, VehicleInventoryEventType.ADJUSTMENT, -20)


def test_a_trip_sale_may_overdraw():
    """record_trip_sale passes allow_negative=True; this is that path."""
    read = _create(5, VehicleInventoryEventType.SALE, 30, allow_negative=True)
    assert read.quantity == -30


def test_unloading_exactly_to_zero_is_allowed():
    assert _create(10, VehicleInventoryEventType.UNLOAD, 10).quantity == -10


# --- deleting events -------------------------------------------------------

@pytest.mark.parametrize("balance,sale_delta", [(-70, -30), (-70, -40), (0, -5), (-5, -5)])
def test_deleting_a_sale_is_allowed_however_overdrawn(balance, sale_delta):
    """Removing a negative delta raises the balance, so it can never make things worse."""
    uow = _Uow(balance, event=_Event(sale_delta))
    read = VehicleInventoryEventDomain.delete_event(uow=uow, uuid="any")
    assert read.is_deleted is True


def test_deleting_a_load_that_would_overdraw_is_still_refused():
    """The stock may since have been sold, so undoing the load is the wrong fix."""
    uow = _Uow(2, event=_Event(5))
    with pytest.raises(BadRequestError, match="would make the vehicle stock negative"):
        VehicleInventoryEventDomain.delete_event(uow=uow, uuid="any")


def test_deleting_a_load_the_van_still_holds_is_allowed():
    uow = _Uow(20, event=_Event(5))
    assert VehicleInventoryEventDomain.delete_event(uow=uow, uuid="any").is_deleted is True
