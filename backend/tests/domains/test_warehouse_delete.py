"""Deleting a warehouse once it is empty (QA STK-WAR-5).

The delete used to refuse any warehouse that had ever held a lot, so a used
warehouse could never be deleted. Lots at zero no longer block it; a lot that
still holds stock does.
"""
import pytest

from app.domains.warehouse.domain import WarehouseDomain
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import Inventory, InventoryEvent, Warehouse

WH_UUID = "wh-1"


def lot(balance: float) -> Inventory:
    inv = Inventory(uuid=f"lot-{balance}", warehouse_uuid=WH_UUID, is_deleted=False)
    inv.inventory_events = [InventoryEvent(quantity=balance, is_deleted=False)] if balance else []
    return inv


class _Repo:
    def __init__(self, rows):
        self.rows = rows

    def find_one(self, **kwargs):
        return next((r for r in self.rows if r.uuid == kwargs.get("uuid")), None)

    def find_all(self, **kwargs):
        return [r for r in self.rows if all(getattr(r, k) == v for k, v in kwargs.items())]

    def save(self, model, commit=False):
        pass


class _Uow:
    def __init__(self, lots):
        self.warehouse = Warehouse(uuid=WH_UUID, name="Hosh Blas", is_deleted=False)
        self.warehouse_repository = _Repo([self.warehouse])
        self.inventory_repository = _Repo(lots)


@pytest.fixture(autouse=True)
def _read_without_columns(monkeypatch):
    monkeypatch.setattr("app.domains.warehouse.domain.WarehouseRead.from_orm", staticmethod(lambda w: w))


def test_warehouse_whose_lots_are_all_empty_can_be_deleted():
    uow = _Uow([lot(0), lot(0)])

    WarehouseDomain.delete_warehouse(uow=uow, uuid=WH_UUID)

    assert uow.warehouse.is_deleted is True, uow.warehouse.is_deleted


@pytest.mark.parametrize("balance", [5.0, -2.0])
def test_warehouse_with_a_lot_still_holding_stock_is_refused(balance):
    uow = _Uow([lot(0), lot(balance)])

    with pytest.raises(BadRequestError):
        WarehouseDomain.delete_warehouse(uow=uow, uuid=WH_UUID)

    assert uow.warehouse.is_deleted is False, uow.warehouse.is_deleted
