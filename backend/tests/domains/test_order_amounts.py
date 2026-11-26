"""Folding per-invoice money rows into per-order totals.

The SQL half of order_amounts() reuses the Invoice hybrid expressions and needs
a real database, which this suite does not have; it is checked by comparing
dashboard responses on a seeded database (see loadtest/README.md).
"""
from datetime import datetime

from app.domains.customer_order.amounts import OrderAmounts, _fold_by_order

T1 = datetime(2026, 11, 1, 9)
T2 = datetime(2026, 11, 2, 9)


def test_sums_every_live_invoice_of_an_order():
    rows = [("o1", T1, "USD", 10.0, 4.0), ("o1", T1, "SYP", 5.0, 5.0)]
    assert _fold_by_order(rows) == [OrderAmounts("o1", T1, "USD", 15.0, 9.0)]


def test_currency_is_the_first_invoice_rows_currency():
    rows = [("o1", T1, "SYP", 1.0, 0.0), ("o1", T1, "USD", 1.0, 0.0)]
    assert _fold_by_order(rows)[0].currency == "SYP"


def test_order_without_a_live_invoice_has_no_currency_and_zero_money():
    rows = [("o1", T1, None, None, None)]
    assert _fold_by_order(rows) == [OrderAmounts("o1", T1, None, 0.0, 0.0)]


def test_orders_stay_separate_and_in_row_order():
    rows = [("o1", T1, "USD", 2.0, 1.0), ("o2", T2, "USD", 3.0, 0.0), ("o2", T2, "USD", 4.0, 4.0)]
    assert _fold_by_order(rows) == [
        OrderAmounts("o1", T1, "USD", 2.0, 1.0),
        OrderAmounts("o2", T2, "USD", 7.0, 4.0),
    ]


def test_no_orders_gives_no_amounts():
    assert _fold_by_order([]) == []
