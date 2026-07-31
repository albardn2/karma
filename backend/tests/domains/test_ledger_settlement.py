"""Which subscription charges are paid, and by how much.

The platform ledger used to be a running balance: charges negative, payments
positive, balance a plain SUM. That answers "does this company owe me money" and
cannot answer "is July paid", which is the question actually asked when a tenant
queries an invoice.

A payment now points at the charge it settles, and a charge derives paid/unpaid from
the payments pointing at it. Derived rather than stored, for the same reason
`Invoice.is_paid` is derived on the customer side: a stored flag and the rows it
summarises drift apart the first time a payment is soft-deleted, and then the ledger
disagrees with itself.

The arithmetic is small and entirely about money, so it is pinned here rather than
discovered in a dispute.
"""
import pytest

from app.domains.billing import domain as billing
from models.common import MONEY_TOLERANCE


class _Charge:
    """Just enough of a charge: the settlement maths reads only `amount`."""

    def __init__(self, amount):
        # charges are stored NEGATIVE, which is exactly why the arithmetic below
        # takes abs() — a sign slip here would make a paid month look owed
        self.amount = amount


def out(charge_amount, paid):
    return billing.outstanding(_Charge(charge_amount), paid)


def paid_off(charge_amount, paid):
    return billing.is_paid(_Charge(charge_amount), paid)


# --- outstanding ----------------------------------------------------------


def test_nothing_paid_leaves_the_whole_charge_outstanding():
    assert out(-30.0, 0.0) == 30.0


def test_a_partial_payment_leaves_the_remainder():
    assert out(-30.0, 10.0) == 20.0


def test_paying_in_full_leaves_nothing():
    assert out(-30.0, 30.0) == 0.0


def test_an_overpayment_never_makes_a_charge_owe_a_negative_amount():
    """An overpayment is a credit on the ACCOUNT, not a negative debt on one month.

    Letting this go below zero would make a single generous payment appear to reduce
    what OTHER months owe, once the outstanding figures are summed for a total.
    """
    assert out(-30.0, 50.0) == 0.0


def test_outstanding_reads_the_magnitude_not_the_sign():
    """Charges are stored negative. A sign slip would report a paid month as owed
    and vice versa."""
    assert out(-30.0, 0.0) == out(30.0, 0.0) == 30.0


# --- is_paid --------------------------------------------------------------


def test_a_fully_paid_charge_is_paid():
    assert paid_off(-30.0, 30.0) is True


def test_a_part_paid_charge_is_not_paid():
    assert paid_off(-30.0, 29.0) is False


def test_dust_left_by_instalments_still_counts_as_paid():
    """The same half-cent bar the invoice code uses, for the same reason: every
    money column is DOUBLE PRECISION, so a charge settled in parts does not land
    bit-exactly on zero and an exact comparison would leave it forever "not quite
    paid" over a residue the UI rounds away.
    """
    total = 30.0
    running = 0.0
    for part in (10.0, 10.0, 10.0):
        running += part
    assert paid_off(-total, running) is True

    awkward = 12.30
    parts = 0.0
    for part in (4.10, 4.10, 4.10):
        parts += part
    assert parts != awkward, "the premise: this really does not land on zero"
    assert paid_off(-awkward, parts) is True


def test_a_real_shortfall_of_one_cent_is_not_paid():
    """The other side of the tolerance: dust is absorbed, an actual debt is not."""
    assert paid_off(-30.0, 29.99) is False


def test_the_bar_is_exactly_the_shared_money_tolerance():
    """Pinned so nobody loosens it to a cent and starts writing off real money."""
    assert MONEY_TOLERANCE == 0.005
    assert paid_off(-30.0, 30.0 - MONEY_TOLERANCE) is True
    assert paid_off(-30.0, 30.0 - MONEY_TOLERANCE * 3) is False


def test_a_zero_charge_is_paid_without_any_payment():
    """A per_user account with no users is charged nothing. That row must read as
    settled, or the unpaid list would offer a month that can never be paid off."""
    assert paid_off(0.0, 0.0) is True
    assert out(0.0, 0.0) == 0.0
