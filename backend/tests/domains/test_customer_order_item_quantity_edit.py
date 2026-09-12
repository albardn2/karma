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


def test_adjust_total_is_the_delta_apportioned_exactly_not_proportionally():
    """The adjustment total is exactly old - new (+ returns goods on a
    decrease, - takes more on an increase) — the delta, NOT a factor of the
    sale event's original magnitude, which can differ after a prior edit. It is
    apportioned EXACTLY along lots: a decrease returns units to the lots the
    line holds them from (newest draw first, never more than a lot holds), an
    increase draws FIFO like a fresh fulfilment. A proportional split invents
    fractional stock on discrete (`pcs`) goods for a multi-lot line."""
    from app.domains.customer_order_item import domain as mod

    src = inspect.getsource(mod.CustomerOrderItemDomain.adjust_quantity)
    assert "delta = old_quantity - new_quantity" in src
    assert "/ total" not in src  # no proportional share
    assert "min(remaining, held)" in src
    assert "get_fifo_inventories_for_material" in src


def test_unfulfill_reverses_vehicle_events_past_the_load_guard():
    """Sale (-q) and its compensating adjustment (+d) reversed together net
    +new_quantity — they can only RAISE the van's balance. Judged on its own,
    the +d event trips delete_event's positive-delta 'load' guard on any
    overdrawn van (routine after trip sales) and rolls the whole unfulfil back,
    in an iteration order the ORM does not fix."""
    from app.domains.customer_order_item import domain as mod
    from app.domains.vehicle_inventory_event import domain as vmod

    src = inspect.getsource(mod.CustomerOrderItemDomain.unfulfill_items)
    assert "allow_negative=True" in src
    params = inspect.signature(vmod.VehicleInventoryEventDomain.delete_event).parameters
    assert "allow_negative" in params and params["allow_negative"].default is False


def test_trip_delivered_quantities_net_the_compensating_adjustments():
    """Trip 'sold' (reconciliation) and the activity 'Fulfilled' rows derive
    delivered quantity from vehicle events. The sale alone is the ORIGINAL
    quantity — after an edit it contradicts the order on the same screen and
    flags a phantom variance — so both must net the coi-tied adjustments in."""
    from models import common as m
    from app.entrypoint.routes.trip import routes as troutes

    needle = 'ev.event_type == "adjustment" and ev.customer_order_item_uuid'
    assert needle in inspect.getsource(m.Trip.sold_inventory_map.fget)
    assert needle in inspect.getsource(troutes)


def test_role_presets_grant_update_on_order_and_invoice_lines():
    """For a non-admin the PRESET is the runtime gate (before_request), not
    the route decorator. Both line edits are PUT -> 'update'; without the
    grant every sales/driver/accountant got 403 while both clients showed
    the editor."""
    import json
    import pathlib
    from app.entrypoint.routes.common import permissions as pmod

    presets = json.loads(
        (pathlib.Path(pmod.__file__).parent / "role_presets.json").read_text()
    )
    for role in ("sales", "driver", "accountant", "sales_associate", "sales_manager"):
        assert "update" in presets[role]["endpoints"]["customer_order_item"], role
        assert "update" in presets[role]["endpoints"]["invoice_item"], role


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
