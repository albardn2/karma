"""The customer-order line quantity edit, and the multi-lot reversal it leans on.

Behaviour is verified live against real data (money cascade + warehouse and
vehicle stock re-sync, both directions, restored); these pins guard the
invariants a refactor could silently break — the edit is DB-coupled (FIFO lot
selection, several repos), so it is pinned by source rather than exercised.
"""
import inspect


def test_unfulfill_reverses_every_warehouse_sale_event():
    """A FIFO sale can span several lots -> several sale events. Reversing only
    the first (the old `inventory_events[0]` bug) strands stock on a multi-lot
    line, which the quantity re-sync would then inherit."""
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.unfulfill_items)
    assert "for ev in inventory_events" in src
    assert "inventory_events[0]" not in src


def test_unfulfill_also_reverses_quantity_edit_adjustments():
    """A quantity edit on a fulfilled line posts compensating ADJUSTMENT events
    on both ledgers. Unfulfilling must reverse those too (not just sales), or
    the lot/van is left off by the edit delta and the line becomes undeletable.
    Note-linked adjustments (credit/debit notes) are a separate lifecycle and
    must be left intact."""
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.unfulfill_items)
    # warehouse: reverse SALE + ADJUSTMENT, but skip note-linked adjustments
    assert "InventoryEventType.ADJUSTMENT.value" in src
    assert "not event.credit_note_item_uuid" in src
    assert "not event.debit_note_item_uuid" in src
    # vehicle: reverse both 'sale' and 'adjustment'
    assert '("sale", "adjustment")' in src


def test_adjust_quantity_posts_adjustment_events_without_touching_the_sale():
    """A fulfilled line's stock is corrected by a compensating ADJUSTMENT event
    on BOTH ledgers — the original sale event is the audit record and must not
    be edited or deleted. An unfulfilled line just sets the column."""
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.adjust_quantity)
    assert "coi.quantity = new_quantity" in src
    # posts adjustments, never reverses/re-fulfils the sale
    assert "InventoryEventType.ADJUSTMENT" in src
    assert "VehicleInventoryEventType.ADJUSTMENT" in src
    assert "unfulfill_items" not in src
    assert "delete_inventory_event" not in src
    # both ledgers: warehouse lot(s) and the vehicle
    assert "inventory_events" in src and "vehicle_inventory_events" in src


def test_adjust_total_is_the_delta_positive_when_quantity_falls():
    """The adjustment total is exactly old - new (+ returns goods on a
    decrease, - takes more on an increase) — the delta, NOT a factor of the
    sale event's original magnitude, which can differ after a prior edit. It is
    split across the sale's lots by each lot's share."""
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.adjust_quantity)
    assert "delta = old_quantity - new_quantity" in src
    assert "delta * (abs(e.quantity or 0) / total)" in src


def test_quantity_edit_is_gated_to_fully_unpaid_orders():
    from app.entrypoint.routes.customer_order_item import routes as mod

    src = inspect.getsource(mod.update_customer_order_item_quantity)
    assert "order_price_edit_state(order)" in src
    # only fully unpaid may edit; single_payment/locked -> 409 quantity_locked
    assert 'state != "unpaid"' in src
    assert '"quantity_locked"' in src


def test_quantity_update_dto_requires_positive_int():
    from app.dto.customer_order_item import CustomerOrderItemQuantityUpdate
    import pytest

    assert CustomerOrderItemQuantityUpdate(quantity=6).quantity == 6
    with pytest.raises(Exception):
        CustomerOrderItemQuantityUpdate(quantity=0)
    with pytest.raises(Exception):
        CustomerOrderItemQuantityUpdate(quantity=-3)
