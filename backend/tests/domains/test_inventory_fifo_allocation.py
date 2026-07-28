"""How a sale is split across inventory lots, and what happens when it overdraws.

The invariant that matters most is not "does it allow negative" — it is that the
returned quantities always sum to what was asked for. Each entry becomes an
inventory event, so a shortfall dropped here would silently under-deduct stock
and the books would disagree with the van.

Selling may overdraw (`allow_negative=True`, used by customer-order fulfilment):
goods left the van whether or not the paperwork kept up, and refusing the
fulfilment loses the record of something that already happened. Production may
not (the default): consuming input that does not exist would invent output.
"""
import pytest

from app.domains.inventory.domain import InventoryDomain
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError

MATERIAL = "mat-1"


class _Lot:
    def __init__(self, uuid, current_quantity):
        self.uuid = uuid
        self.material_uuid = MATERIAL
        self.current_quantity = current_quantity
        self.is_deleted = False


class _Repo:
    def __init__(self, lots):
        self._lots = lots

    def get_fifo_inventories_for_material(self, material_uuid, quantity):
        # the real repository returns positive lots, oldest first
        return [lot for lot in self._lots if lot.current_quantity > 0]


class _Uow:
    """Just enough of the unit of work for the allocator."""

    def __init__(self, lots, all_lots=None):
        self.inventory_repository = _Repo(lots)
        self.account_uuid = "acct-1"
        self._all_lots = all_lots if all_lots is not None else lots
        self.session = self

    # the shortfall fallback queries for any lot of the material; these three
    # methods stand in for that chain
    def query(self, _model):
        return self

    def filter(self, *_args):
        return self

    def order_by(self, *_args):
        return self

    def first(self):
        return self._all_lots[-1] if self._all_lots else None


def allocate(lots, quantity, allow_negative=False, all_lots=None):
    return InventoryDomain.get_fifo_inventories_for_material(
        uow=_Uow(lots, all_lots), material_uuid=MATERIAL,
        quantity=quantity, allow_negative=allow_negative,
    )


def test_covered_request_drains_oldest_first():
    out = allocate([_Lot("old", 100), _Lot("new", 100)], 150)
    assert [(o.inventory_uuid, o.quantity) for o in out] == [("old", 100), ("new", 50)]


def test_covered_request_stops_at_the_first_sufficient_lot():
    out = allocate([_Lot("old", 100), _Lot("new", 100)], 60)
    assert [(o.inventory_uuid, o.quantity) for o in out] == [("old", 60)]


def test_shortfall_is_refused_by_default():
    """The production path relies on this."""
    with pytest.raises(NotFoundError, match="Insufficient inventory"):
        allocate([_Lot("old", 10)], 25)


def test_shortfall_lands_on_the_lot_fifo_stopped_at():
    out = allocate([_Lot("old", 100), _Lot("new", 50)], 200, allow_negative=True)
    # 'new' takes its own 50 plus the 50 that does not exist
    assert [(o.inventory_uuid, o.quantity) for o in out] == [("old", 100), ("new", 100)]


def test_allocation_always_sums_to_the_request():
    for quantity in (1, 99, 150, 1000):
        out = allocate([_Lot("old", 100), _Lot("new", 50)], quantity, allow_negative=True)
        assert sum(o.quantity for o in out) == pytest.approx(quantity), quantity


def test_no_positive_lots_falls_back_to_an_existing_lot():
    """Everything already at or below zero: the overdraft accumulates on one lot."""
    empty = _Lot("drained", 0)
    out = allocate([empty], 30, allow_negative=True, all_lots=[empty])
    assert [(o.inventory_uuid, o.quantity) for o in out] == [("drained", 30)]


def test_no_lot_at_all_is_refused_with_a_reason():
    """A lot needs a warehouse and a sale does not name one, so this cannot be guessed."""
    with pytest.raises(BadRequestError, match="no inventory lot"):
        allocate([], 30, allow_negative=True, all_lots=[])


def test_single_lot_oversell_matches_the_observed_behaviour():
    """986 in stock, 1486 sold, lot ends at -500 (checked against the real stack)."""
    out = allocate([_Lot("only", 986)], 1486, allow_negative=True)
    assert [(o.inventory_uuid, o.quantity) for o in out] == [("only", 1486)]
