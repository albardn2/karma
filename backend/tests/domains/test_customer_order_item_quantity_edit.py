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


def test_adjust_quantity_resyncs_stock_only_when_fulfilled():
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.adjust_quantity)
    # the stock cascade runs behind `was_fulfilled` — an unfulfilled line moves
    # no stock and just sets the column
    assert "was_fulfilled = coi.is_fulfilled" in src
    assert "coi.quantity = new_quantity" in src
    # fulfilled: reverse (unfulfil) then re-fulfil at the new quantity
    assert "unfulfill_items" in src
    assert "fulfill_items" in src
    # the re-fulfilment must preserve the vehicle attribution (same trip stop)
    assert "trip_stop_uuid" in src


def test_adjust_quantity_preserves_the_original_fulfilment_dates():
    """Re-fulfilment stamps now(); a quantity fix must NOT re-date an
    already-delivered line — the delivery timestamp and the sale's dashboard
    period (inventory-event created_at) stay put, only the amount changes."""
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.adjust_quantity)
    assert "original_fulfilled_at = coi.fulfilled_at" in src
    assert "coi.fulfilled_at = original_fulfilled_at" in src
    # the new warehouse + vehicle sale events are re-dated back too
    assert "e.created_at = original_fulfilled_at" in src


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
