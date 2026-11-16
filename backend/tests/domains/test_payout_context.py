"""What a payout paid for, carried on the payout itself (QA MON-PAY-5, MON-PAY-6).

A payout links to exactly one of an expense, a purchase order, an employee or a
credit note. The list showed only "For expense" / "For purchase order" and called
the other two "Unlinked", so every row looked alike.
"""
import pytest

from models.common import CreditNoteItem, Customer, Employee, Expense, Payout, PurchaseOrder, Vendor


@pytest.mark.parametrize(
    "payout, expected",
    [
        (Payout(expense=Expense(description="Fuel for the van", category="fuel")), "Fuel for the van"),
        (Payout(expense=Expense(description=None, category="fuel")), "fuel"),
        (Payout(purchase_order=PurchaseOrder(vendor=Vendor(company_name="Hosh Blas Mill"))), "Hosh Blas Mill"),
        (Payout(employee=Employee(full_name="Wael Wael")), "Wael Wael"),
        (Payout(credit_note_item=CreditNoteItem(customer=Customer(full_name="Abu Mohammad", company_name=None))), "Abu Mohammad"),
        (Payout(), None),
    ],
)
def test_payout_names_what_it_paid_for(payout, expected):
    assert payout.paid_for == expected, payout.paid_for
