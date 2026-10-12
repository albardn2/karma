"""Expected cash split into this trip's sales and debt collected on the road.

`expected_cash` is every live payment taken at the trip's stops. The split
answers "where did it come from": a payment for an order created at one of
THIS trip's stops, or delivered from the van at one of them, is trip revenue;
any other payment taken at a stop is old debt coming in (goods handed over on
an earlier trip or from the warehouse, or a payment that pays no order). The two must always add up to expected_cash, currency by currency,
or the trip page's breakdown would not reconcile with its own total.

Real model objects, unsaved, like test_trip_cash.py: the properties are plain
Python over the loaded relationships.
"""
from models.common import CustomerOrder as OrderModel
from models.common import CustomerOrderItem as ItemModel
from models.common import Invoice as InvoiceModel
from models.common import Payment as PaymentModel
from models.common import Trip as TripModel
from models.common import TripStop as TripStopModel
from models.common import VehicleInventoryEvent as EventModel


def _order(stop_uuid, is_deleted=False, uuid=None):
    """An order created at `stop_uuid` (None: made at the office)."""
    return OrderModel(uuid=uuid, trip_stop_uuid=stop_uuid, is_deleted=is_deleted)


def _delivered(order_uuid, event_type="sale", is_deleted=False, item_deleted=False):
    """A van event at a stop for an item of `order_uuid`: 'sale' is goods
    handed over from the van."""
    return EventModel(
        event_type=event_type, quantity=-1.0, is_deleted=is_deleted,
        customer_order_item=ItemModel(customer_order_uuid=order_uuid, is_deleted=item_deleted),
    )


def _pay(amount, order=None, currency="SYP", is_deleted=False, invoice_deleted=False):
    invoice = None
    if order is not None:
        invoice = InvoiceModel(customer_order=order, is_deleted=invoice_deleted)
    return PaymentModel(amount=amount, currency=currency, payment_method="cash",
                        is_deleted=is_deleted, invoice=invoice)


def _trip(*stops):
    """stops: (uuid, [payments]) pairs."""
    return TripModel(status="completed", stops=[
        TripStopModel(uuid=uuid, status="completed", payments=payments)
        for uuid, payments in stops
    ])


def _assert_adds_up(trip):
    total = trip.expected_cash
    sales, debt = trip.cash_from_trip_sales, trip.cash_from_debt
    assert set(sales) == set(debt) == set(total)
    for currency in total:
        assert abs(sales[currency] + debt[currency] - total[currency]) < 1e-9


def test_a_sale_made_and_paid_on_the_trip_is_trip_revenue():
    trip = _trip(("s1", [_pay(1000.0, _order("s1"))]))
    assert trip.cash_from_trip_sales == {"SYP": 1000.0}
    assert trip.cash_from_debt == {"SYP": 0}
    _assert_adds_up(trip)


def test_an_earlier_trips_order_paid_at_a_stop_is_debt_collected():
    trip = _trip(("s1", [_pay(250.0, _order("stop-of-an-earlier-trip"))]))
    assert trip.cash_from_trip_sales == {"SYP": 0}
    assert trip.cash_from_debt == {"SYP": 250.0}
    _assert_adds_up(trip)


def test_an_office_order_paid_at_a_stop_is_debt_collected():
    """The order has no stop at all. An unsaved stop's uuid is None too, which
    must not make the two match."""
    trip = _trip(("s1", [_pay(40.0, _order(None))]))
    assert trip.cash_from_debt == {"SYP": 40.0}
    trip = TripModel(status="completed", stops=[
        TripStopModel(status="completed", payments=[_pay(40.0, _order(None))]),
    ])
    assert trip.cash_from_debt == {"SYP": 40.0}
    assert trip.cash_from_trip_sales == {"SYP": 0}


def test_an_order_sold_at_one_stop_and_paid_at_another_of_the_same_trip_is_revenue():
    trip = _trip(("s1", []), ("s2", [_pay(300.0, _order("s1"))]))
    assert trip.cash_from_trip_sales == {"SYP": 300.0}
    assert trip.cash_from_debt == {"SYP": 0}


def test_a_payment_for_no_order_is_debt_collected():
    """A debit note, say: it pays nothing this trip sold."""
    trip = _trip(("s1", [_pay(75.0)]))
    assert trip.cash_from_debt == {"SYP": 75.0}
    _assert_adds_up(trip)


def test_the_mixed_case_from_the_local_data():
    """A 40 USD sale on this trip plus a 25 USD older order collected: the trip
    page used to show only 'Collected 65'."""
    trip = _trip(("s1", [_pay(40.0, _order("s1"), currency="USD"),
                         _pay(25.0, _order(None), currency="USD")]))
    assert trip.expected_cash == {"USD": 65.0}
    assert trip.cash_from_trip_sales == {"USD": 40.0}
    assert trip.cash_from_debt == {"USD": 25.0}


def test_currencies_stay_apart_and_both_parts_carry_every_one():
    trip = _trip(("s1", [_pay(1000.0, _order("s1"), currency="SYP"),
                         _pay(10.0, _order(None), currency="USD")]))
    assert trip.cash_from_trip_sales == {"SYP": 1000.0, "USD": 0}
    assert trip.cash_from_debt == {"SYP": 0, "USD": 10.0}
    _assert_adds_up(trip)


def test_voided_money_is_left_out_of_both_parts_as_it_is_of_the_total():
    trip = _trip(("s1", [
        _pay(100.0, _order("s1"), is_deleted=True),
        _pay(200.0, _order("s1", is_deleted=True)),
        _pay(300.0, _order(None), invoice_deleted=True),
        _pay(50.0, _order("s1")),
    ]))
    assert trip.expected_cash == {"SYP": 50.0}
    assert trip.cash_from_trip_sales == {"SYP": 50.0}
    assert trip.cash_from_debt == {"SYP": 0}


def test_a_trip_with_no_payments_has_empty_parts():
    trip = _trip(("s1", []))
    assert trip.expected_cash == {}
    assert trip.cash_from_trip_sales == {}
    assert trip.cash_from_debt == {}


def _trip_with_delivery(order, events):
    """One stop that delivered `events` and took a 100 SYP payment for `order`."""
    stop = TripStopModel(uuid="s1", status="completed", payments=[_pay(100.0, order)])
    stop.vehicle_inventory_events = events
    return TripModel(status="completed", stops=[stop])


def test_a_pre_order_delivered_and_paid_on_this_trip_is_trip_revenue():
    """An office pre-order (or one written up on an earlier trip) delivered
    from the van and paid on delivery: the stock table counts it as sold on
    this trip, so its cash is this trip's revenue, not a debt."""
    for created_at in (None, "stop-of-an-earlier-trip"):
        order = _order(created_at, uuid="o1")
        trip = _trip_with_delivery(order, [_delivered("o1")])
        assert trip.cash_from_trip_sales == {"SYP": 100.0}
        assert trip.cash_from_debt == {"SYP": 0}


def test_goods_handed_over_before_this_trip_are_still_debt():
    """No live sale from this trip's van for the order: what is paid now is
    for goods the customer already had."""
    for events in ([], [_delivered("o1", is_deleted=True)], [_delivered("o1", item_deleted=True)],
                   [_delivered("o1", event_type="adjustment")], [_delivered("another-order")]):
        trip = _trip_with_delivery(_order(None, uuid="o1"), events)
        assert trip.cash_from_debt == {"SYP": 100.0}, events
        assert trip.cash_from_trip_sales == {"SYP": 0}


def test_an_order_without_a_uuid_never_matches_a_delivery():
    trip = _trip_with_delivery(_order(None), [_delivered(None)])
    assert trip.cash_from_debt == {"SYP": 100.0}


def test_the_activity_tabs_rule_is_the_cards_rule():
    """The activity feed marks debt with pays_order_sold_on_trip directly; it
    must classify exactly as the card's split does."""
    trip = _trip(("s1", []), ("s2", []))
    stops = trip.stop_uuid_set()
    assert stops == {"s1", "s2"}
    assert TripModel.pays_order_sold_on_trip(_order("s2"), stops) is True
    assert TripModel.pays_order_sold_on_trip(_order("elsewhere"), stops) is False
    assert TripModel.pays_order_sold_on_trip(_order(None), stops) is False
    assert TripModel.pays_order_sold_on_trip(None, stops) is False
    assert TripModel.pays_order_sold_on_trip(_order(None, uuid="o9"), stops, {"o9"}) is True
    # an unsaved stop has no uuid; it must not let an office order match
    unsaved = TripModel(stops=[TripStopModel(status="completed")])
    assert unsaved.stop_uuid_set() == set()


def test_the_parts_are_serialized():
    from app.dto.trip import TripRead
    dumped = TripRead.model_fields
    assert "cash_from_trip_sales" in dumped and "cash_from_debt" in dumped
