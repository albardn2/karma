"""An invoice settled in instalments must read as paid.

Every money column is DOUBLE PRECISION, so a balance paid in parts does not land
bit-exactly on zero. `Invoice.is_paid` used to be `net_amount_due == 0`, which
meant a fully-collected invoice could stay "pending" forever over dust the UI
rounds away to 0.00 — and the overpayment guard was `net_amount_due < 0`, which
*rejected* the very payment that settled the balance in about half of those
cases.

Both now compare against MONEY_TOLERANCE (half a cent): a real discrepancy is at
least one cent and stays visible, float dust is absorbed. These tests pin that
boundary from both sides, so nobody tightens it back to an exact comparison.
"""
import pytest

from models.common import MONEY_TOLERANCE, Invoice

# the Python branch of the hybrid; the class attribute is the SQL expression
_is_paid = Invoice.__dict__["is_paid"].fget


class _Invoice:
    """Just enough of an invoice: is_paid reads only net_amount_due."""

    def __init__(self, due):
        self.net_amount_due = due


def paid(due):
    return _is_paid(_Invoice(due))


def test_a_zero_balance_is_paid():
    assert paid(0.0) is True


def test_dust_left_by_instalments_counts_as_paid():
    """12.30 collected as 4.10 x3 leaves +1.8e-15 in float."""
    total = 12.30
    running = 0.0
    for part in (4.10, 4.10, 4.10):
        running += part
    residual = total - running
    assert residual != 0, "the premise: this really does not land on zero"
    assert paid(residual) is True


def test_negative_dust_also_counts_as_paid():
    """20.20 as 6.73 + 6.73 + 6.74 overshoots by 3.6e-15."""
    total = 20.20
    running = 0.0
    for part in (6.73, 6.73, 6.74):
        running += part
    residual = total - running
    assert residual < 0, "the premise: this overshoots"
    assert paid(residual) is True


@pytest.mark.parametrize("due", [0.01, 0.5, 1.0, 13.33, 14860.0])
def test_a_real_balance_is_not_paid(due):
    """One cent is the smallest thing a currency can express — it must show."""
    assert paid(due) is False


@pytest.mark.parametrize("due", [-0.01, -1.0, -500.0])
def test_a_real_overpayment_is_not_silently_absorbed(due):
    """A credit balance is not 'paid' either — it is a different problem, and
    hiding it would be worse than showing it."""
    assert paid(due) is False


def test_the_boundary_sits_at_half_a_cent():
    assert paid(MONEY_TOLERANCE) is True          # exactly half a cent: absorbed
    assert paid(-MONEY_TOLERANCE) is True
    assert paid(MONEY_TOLERANCE * 2) is False     # a whole cent: visible
    assert paid(-MONEY_TOLERANCE * 2) is False


def test_tolerance_is_smaller_than_a_cent():
    """If this ever grew past a cent, real money would vanish from the books."""
    assert 0 < MONEY_TOLERANCE < 0.01
