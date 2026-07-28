"""What a lot's cost per unit means, and what it must survive.

A lot's cost is a weighted average over its receipts, and only receipts whose
cost is actually knowable belong in it: an explicit event cost (0 included —
free goods are free, not costless), a purchase order item's adjusted price, or
a process output's rolled-up cost. A receipt with none of those has an UNKNOWN
cost; folding its quantity into the divisor used to silently dilute the
average of every lot with a costless opening balance.

Costing is also recursive — a process output's cost is computed from its input
lots' costs, which may come from other processes. Lots reachable through the
public API can form a cycle, and before the guard tested here one poisoned lot
made every read of it (including the whole paginated inventory list) die with
RecursionError.
"""
import pytest

from app.domains.inventory.domain import InventoryDomain
from app.dto.inventory_event import InventoryEventCreate
from app.entrypoint.routes.common.errors import BadRequestError


class _Event:
    def __init__(self, quantity, cost_per_unit=None, po_item=None, process=None,
                 affect_original=True, currency="SYP", created_at=None):
        from datetime import datetime
        self.quantity = quantity
        self.cost_per_unit = cost_per_unit
        # SYP matches the default target currency, so tests that are about the
        # arithmetic never trigger a conversion
        self.currency = currency
        self.created_at = created_at or datetime(2026, 7, 1)
        self.is_deleted = False
        self.affect_original = affect_original
        self.purchase_order_item_uuid = "poi-1" if po_item is not None else None
        self.purchase_order_item = po_item
        self.process_uuid = getattr(process, "uuid", None)
        self.process = process


class _PoItem:
    def __init__(self, adjusted_price_per_unit, currency="SYP"):
        self.adjusted_price_per_unit = adjusted_price_per_unit
        self.currency = currency


class _Process:
    def __init__(self, uuid, data):
        self.uuid = uuid
        self.data = data


class _Lot:
    def __init__(self, uuid, events):
        self.uuid = uuid
        self.inventory_events = events


class _Repo:
    def __init__(self, lots):
        self._lots = {lot.uuid: lot for lot in lots}
        self.find_one_calls = 0

    def find_one(self, uuid, **_kwargs):
        self.find_one_calls += 1
        return self._lots.get(uuid)


class _Uow:
    def __init__(self, *lots):
        self.inventory_repository = _Repo(lots)


class _Dto:
    def __init__(self, uuid):
        self.uuid = uuid
        self.cost_per_unit = None
        self.total_original_cost = None


def _enrich(uow, lot_uuid, cost_ctx=None):
    dto = _Dto(lot_uuid)
    InventoryDomain.enrich_cost_per_unit(uow=uow, inventory_dto=dto, cost_ctx=cost_ctx)
    return dto


# --- which receipts belong in the average --------------------------------


def test_explicit_zero_cost_is_free_goods_not_a_missing_cost():
    # the old truthiness check fell through to the PO price and re-costed a
    # deliberately free receipt at 20
    lot = _Lot("a", [_Event(100, cost_per_unit=0, po_item=_PoItem(20))])
    assert _enrich(_Uow(lot), "a").cost_per_unit == 0


def test_costless_receipt_does_not_dilute_the_average():
    # 100 @ 10 plus 50 of unknown cost: the answer is 10, not 1000/150
    lot = _Lot("a", [_Event(100, cost_per_unit=10), _Event(50)])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit == pytest.approx(10)
    # the unknown 50 are valued at the average they inherit
    assert dto.total_original_cost == pytest.approx(10 * 150)


def test_negative_costless_adjustment_is_excluded_too():
    lot = _Lot("a", [_Event(100, cost_per_unit=10), _Event(-30)])
    assert _enrich(_Uow(lot), "a").cost_per_unit == pytest.approx(10)


def test_lot_with_only_unknown_costs_reports_unknown_not_free():
    lot = _Lot("a", [_Event(50)])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit is None
    assert dto.total_original_cost is None


def test_po_price_is_still_the_fallback_for_uncosted_po_receipts():
    lot = _Lot("a", [_Event(50, po_item=_PoItem(7))])
    dto = _enrich(_Uow(lot), "a")
    assert dto.cost_per_unit == pytest.approx(7)
    assert dto.total_original_cost == pytest.approx(350)


# --- process roll-up ------------------------------------------------------


def _process(uuid, input_lot, in_qty, output_lot, out_qty):
    return _Process(uuid, {
        "inputs": [{"inventory_uuid": input_lot, "quantity": in_qty}],
        "outputs": [{
            "inventory_uuid": output_lot,
            "material_uuid": "mat-1",
            "quantity": out_qty,
            "inputs_used": [{"inventory_uuid": input_lot, "quantity": in_qty}],
        }],
    })


def test_process_output_inherits_its_inputs_cost():
    # 10 units of B at 3 become 5 units of A: A costs 6
    p1 = _process("p1", "b", 10, "a", 5)
    a = _Lot("a", [_Event(5, process=p1)])
    b = _Lot("b", [_Event(10, cost_per_unit=3)])
    assert _enrich(_Uow(a, b), "a").cost_per_unit == pytest.approx(6)


def test_a_cost_cycle_terminates_instead_of_recursing_forever():
    # A is produced from B, and B is produced from A — constructible through
    # the public process API. The back-edge is unknowable, which makes every
    # cost in the cycle unknowable — reported as unknown, never as a crash.
    p1 = _process("p1", "b", 10, "a", 10)
    p2 = _process("p2", "a", 10, "b", 10)
    a = _Lot("a", [_Event(10, process=p1)])
    b = _Lot("b", [_Event(10, process=p2)])
    dto = _enrich(_Uow(a, b), "a")
    assert dto.cost_per_unit is None


def test_a_lot_in_a_cycle_costs_the_same_wherever_the_page_starts():
    """A value computed while a cycle was being cut depends on where the cut
    fell, so it must not be served from the shared per-page cache — or the
    list and the detail page would disagree about the same lot. With unknowns
    propagating, everything a cycle touches is unknown in every order."""
    def build():
        p1 = _Process("p1", {
            "inputs": [{"inventory_uuid": "b", "quantity": 10},
                       {"inventory_uuid": "c", "quantity": 10}],
            "outputs": [{
                "inventory_uuid": "a", "material_uuid": "mat-1", "quantity": 10,
                "inputs_used": [{"inventory_uuid": "b", "quantity": 10},
                                {"inventory_uuid": "c", "quantity": 10}],
            }],
        })
        p2 = _process("p2", "a", 10, "b", 10)
        return _Uow(
            _Lot("a", [_Event(10, process=p1)]),
            _Lot("b", [_Event(10, process=p2)]),
            _Lot("c", [_Event(10, cost_per_unit=5)]),
        )

    alone = _enrich(build(), "b").cost_per_unit

    # b costed after a on one shared page context
    uow = build()
    ctx = InventoryDomain.new_cost_context()
    a_first = _enrich(uow, "a", cost_ctx=ctx).cost_per_unit
    paged = _enrich(uow, "b", cost_ctx=ctx).cost_per_unit

    assert alone is None and paged is None and a_first is None


def test_costing_a_lot_never_writes_into_process_data():
    # process.data is a MutableDict in the real model: anything stamped into
    # it during a read would be flushed to the database by the next commit
    p1 = _process("p1", "b", 10, "a", 5)
    a = _Lot("a", [_Event(5, process=p1)])
    b = _Lot("b", [_Event(10, cost_per_unit=3)])
    _enrich(_Uow(a, b), "a")
    assert "cost_per_unit" not in p1.data["inputs"][0]
    assert "cost_per_unit" not in p1.data["outputs"][0]
    assert "total_cost" not in p1.data["outputs"][0]


def test_a_shared_context_costs_each_lot_once():
    lot = _Lot("a", [_Event(100, cost_per_unit=10)])
    uow = _Uow(lot)
    ctx = InventoryDomain.new_cost_context()
    first = _enrich(uow, "a", cost_ctx=ctx)
    second = _enrich(uow, "a", cost_ctx=ctx)
    assert first.cost_per_unit == second.cost_per_unit == pytest.approx(10)
    assert uow.inventory_repository.find_one_calls == 1


# --- the SQL side of the PO price fallback --------------------------------


def test_adjusted_price_per_unit_compiles_as_a_sql_expression():
    """The expression used the SQLAlchemy 1.x case([...]) list form, which the
    pinned 2.x raises ArgumentError on — a landmine for any query that touches
    the class-level attribute."""
    from sqlalchemy import select
    from models.common import PurchaseOrderItem

    str(select(PurchaseOrderItem.adjusted_price_per_unit))


# --- event creation must allow a real zero cost ---------------------------


def _manual_event(**overrides):
    payload = dict(
        inventory_uuid="a",
        event_type="manual",
        quantity=10.0,
        affect_original=True,
    )
    payload.update(overrides)
    return payload


def test_a_manual_event_may_cost_zero_with_a_currency():
    event = InventoryEventCreate(**_manual_event(cost_per_unit=0.0, currency="USD"))
    assert event.cost_per_unit == 0


def test_a_zero_cost_still_requires_a_currency():
    # bool(0) used to make a zero cost invisible to this check
    with pytest.raises(BadRequestError, match="currency"):
        InventoryEventCreate(**_manual_event(cost_per_unit=0.0))


def test_a_zero_cost_on_a_non_manual_event_is_still_rejected():
    with pytest.raises(BadRequestError):
        InventoryEventCreate(**_manual_event(event_type="adjustment",
                                             cost_per_unit=0.0, currency="USD"))
