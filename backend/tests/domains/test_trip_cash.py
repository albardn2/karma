"""What a trip's cash figures deduct, and what they only report.

`net_expected_cash` is the number a driver is reconciled against: hand back the
cash collected at the stops, less whatever was spent out of it on the road. The
deduction therefore has to be money that ACTUALLY left — a payout — not an
expense's face value. An expense booked with no live payout behind it has taken
nothing out of the van, so deducting it would credit the driver for cash still
in their pocket.

Two ways a trip expense ends up with no live payout, neither of them reachable
from today's screens (both clients hardcode should_pay) but both reachable over
the API: creating the expense with should_pay false, and soft-deleting the
auto-created payout afterwards. The second is why this counts live payouts
rather than trusting a flag set at creation time.

These run against the real model objects, unsaved: the properties are plain
Python over the loaded relationships, so a session would add nothing but setup.
"""
from models.common import Expense as ExpenseModel
from models.common import Payment as PaymentModel
from models.common import Payout as PayoutModel
from models.common import Trip as TripModel
from models.common import TripStop as TripStopModel


def _expense(amount, currency="SYP", paid=None, is_deleted=False):
    """An expense with `paid` recorded against it, as (amount, is_deleted) pairs.

    A payout is forced to its expense's currency when it is created
    (PayoutDomain.validate_currencies), so the payouts here carry the expense's.
    """
    return ExpenseModel(
        amount=amount,
        currency=currency,
        category="fuel",
        is_deleted=is_deleted,
        payouts=[
            PayoutModel(amount=payout_amount, currency=currency, is_deleted=payout_deleted)
            for payout_amount, payout_deleted in (paid or [])
        ],
    )


def _trip(expenses, collected=None):
    """A trip that collected `collected` at one stop and booked `expenses`."""
    stop = TripStopModel(status="completed")
    stop.payments = [
        PaymentModel(amount=amount, currency=currency,
                     payment_method="cash", is_deleted=False)
        for currency, amount in (collected or {}).items()
    ]
    return TripModel(status="completed", stops=[stop], expenses=expenses)


def test_a_paid_expense_is_deducted():
    trip = _trip([_expense(100.0, paid=[(100.0, False)])], collected={"SYP": 1000.0})
    assert trip.trip_expenses == {"SYP": 100.0}
    assert trip.trip_expenses_paid == {"SYP": 100.0}
    assert trip.trip_expenses_unpaid == {"SYP": 0.0}
    assert trip.net_expected_cash == {"SYP": 900.0}


def test_an_expense_with_no_payout_is_reported_not_deducted():
    """`POST /expense/` with should_pay false: the cost is real and belongs on
    the trip, but no cash has gone anywhere yet."""
    trip = _trip([_expense(100.0)], collected={"SYP": 1000.0})
    assert trip.trip_expenses == {"SYP": 100.0}
    assert trip.trip_expenses_paid == {"SYP": 0.0}
    assert trip.trip_expenses_unpaid == {"SYP": 100.0}
    assert trip.net_expected_cash == {"SYP": 1000.0}


def test_deleting_the_payout_puts_the_cash_back():
    """`DELETE /payout/<uuid>` is an unconditional soft delete, so an expense
    can lose its payout after the fact and must stop being deducted."""
    trip = _trip([_expense(100.0, paid=[(100.0, True)])], collected={"SYP": 1000.0})
    assert trip.trip_expenses_paid == {"SYP": 0.0}
    assert trip.trip_expenses_unpaid == {"SYP": 100.0}
    assert trip.net_expected_cash == {"SYP": 1000.0}


def test_a_part_paid_expense_deducts_only_the_part_paid():
    trip = _trip([_expense(100.0, paid=[(30.0, False), (25.0, False)])],
                 collected={"SYP": 1000.0})
    assert trip.trip_expenses_paid == {"SYP": 55.0}
    assert trip.trip_expenses_unpaid == {"SYP": 45.0}
    assert trip.net_expected_cash == {"SYP": 945.0}


def test_a_deleted_expense_counts_for_nothing_even_if_it_was_paid():
    """Voiding the expense takes it out of all three figures; the payout behind
    it is the payout ledger's problem, not this trip's."""
    trip = _trip(
        [
            _expense(100.0, paid=[(100.0, False)], is_deleted=True),
            _expense(40.0, paid=[(40.0, False)]),
        ],
        collected={"SYP": 1000.0},
    )
    assert trip.trip_expenses == {"SYP": 40.0}
    assert trip.trip_expenses_paid == {"SYP": 40.0}
    assert trip.net_expected_cash == {"SYP": 960.0}


def test_currencies_are_never_mixed():
    """Fuel paid in SYP and a part bought in USD are separate columns, and a
    currency only spent in still gets one."""
    trip = _trip(
        [
            _expense(200.0, currency="SYP", paid=[(200.0, False)]),
            _expense(10.0, currency="USD", paid=[(4.0, False)]),
        ],
        collected={"SYP": 1000.0},
    )
    assert trip.trip_expenses == {"SYP": 200.0, "USD": 10.0}
    assert trip.trip_expenses_paid == {"SYP": 200.0, "USD": 4.0}
    assert trip.trip_expenses_unpaid == {"SYP": 0.0, "USD": 6.0}
    assert trip.net_expected_cash == {"SYP": 800.0, "USD": -4.0}


def test_all_three_figures_carry_the_same_currencies():
    """The clients build their currency list off `trip_expenses`; a currency
    that showed up only in the paid or unpaid dict would be dropped."""
    trip = _trip([_expense(50.0, currency="USD"), _expense(70.0, currency="SYP",
                                                          paid=[(70.0, False)])])
    assert (
        set(trip.trip_expenses)
        == set(trip.trip_expenses_paid)
        == set(trip.trip_expenses_unpaid)
        == {"USD", "SYP"}
    )


def test_float_residue_does_not_show_up_as_an_outstanding_fraction():
    """0.1 + 0.2 != 0.3 in binary floats; the unpaid figure is a difference, so
    without rounding a fully paid expense would report a phantom balance and the
    clients would show an Unpaid column for it."""
    trip = _trip([_expense(0.3, paid=[(0.1, False), (0.2, False)])])
    assert trip.trip_expenses_unpaid == {"SYP": 0.0}


def test_a_trip_with_no_expenses_has_nothing_to_deduct():
    trip = _trip([], collected={"SYP": 1000.0})
    assert trip.trip_expenses == {}
    assert trip.trip_expenses_paid == {}
    assert trip.trip_expenses_unpaid == {}
    assert trip.net_expected_cash == {"SYP": 1000.0}
