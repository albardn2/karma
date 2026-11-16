"""A production run's costs, read in the currency the viewer asks for (QA STK-PRO-3).

A run stores its costs converted to the default cost currency at write time, so an
all-USD run read "434.63 SYP" with no way to see it in dollars. Reading a run in a
given currency recomputes every input and output cost in that currency, and labels
the result with it, without rewriting the stored snapshot.
"""
import copy
from datetime import datetime

import pytest

from app.domains.inventory.domain import InventoryDomain
from app.domains.process.domain import ProcessDomain
from app.dto.common_enums import Currency
from models.common import Process as ProcessModel

LOT_UUID = "lot-1"
OUTPUT_LOT_UUID = "lot-out-1"
LOT_COST = {Currency.USD: 2.0, Currency.SYP: 268.0}
CONSUMED_QUANTITY = 5.0
PRODUCED_QUANTITY = 2.0

STORED_DATA = {
    "inputs": [
        {"inventory_uuid": LOT_UUID, "quantity": CONSUMED_QUANTITY, "material_uuid": "mat-in", "cost_per_unit": 268.0}
    ],
    "outputs": [
        {
            "inputs_used": [{"inventory_uuid": LOT_UUID, "quantity": CONSUMED_QUANTITY}],
            "material_uuid": "mat-out",
            "quantity": PRODUCED_QUANTITY,
            "inventory_uuid": OUTPUT_LOT_UUID,
            "total_cost": 1340.0,
            "cost_per_unit": 670.0,
        }
    ],
    "output_warehouse_uuid": None,
    "cost_currency": "SYP",
}


def make_process() -> ProcessModel:
    p = ProcessModel(uuid="proc-1", type="palm_oil_preparation", notes=None, data=copy.deepcopy(STORED_DATA))
    object.__setattr__(p, "is_deleted", False)
    object.__setattr__(p, "created_at", datetime(2026, 11, 2, 9, 0, 0))
    object.__setattr__(p, "created_by_uuid", None)
    object.__setattr__(p, "workflow_execution_uuid", None)
    return p


class _InventoryRepo:
    def find_one(self, **_kwargs):
        return object()


class _Uow:
    inventory_repository = _InventoryRepo()


@pytest.fixture(autouse=True)
def _lot_cost_by_currency(monkeypatch):
    def fake_lot_cost(uow, inventory_uuid, ctx):
        return LOT_COST[ctx["currency"]], CONSUMED_QUANTITY

    monkeypatch.setattr(InventoryDomain, "_lot_cost_and_quantity", staticmethod(fake_lot_cost))


def _read(currency: Currency):
    process = make_process()
    dto = ProcessDomain.read_with_costs(
        uow=_Uow(), process=process, cost_ctx=InventoryDomain.new_cost_context(currency=currency)
    )
    return process, dto


def test_reading_in_usd_reports_usd_costs():
    _, dto = _read(Currency.USD)

    assert dto.data.cost_currency == Currency.USD, dto.data
    assert dto.data.inputs[0].cost_per_unit == LOT_COST[Currency.USD], dto.data.inputs
    expected_total = LOT_COST[Currency.USD] * CONSUMED_QUANTITY
    assert dto.data.outputs[0].total_cost == expected_total, dto.data.outputs
    assert dto.data.outputs[0].cost_per_unit == expected_total / PRODUCED_QUANTITY, dto.data.outputs


def test_reading_in_another_currency_leaves_the_stored_snapshot_unchanged():
    process, _ = _read(Currency.USD)

    assert process.data == STORED_DATA, process.data
