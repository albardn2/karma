"""Deleting an expense takes its payouts with it — and puts the money back.

Until this change a paid expense could not be deleted at all ("Expense cannot
be deleted because it has associated payouts"). Nearly every expense is paid —
trip expenses are always recorded as paid, and a paid expense's amount cannot
be edited — so a wrong one could never be removed.

What matters is the money. Nothing about a payout is stored elsewhere: an
account's balance and an expense's paid/owed figures are computed from the
LIVE payouts on every read. So soft-deleting the payouts is the entire
reversal, and these tests pin that down: the account gets its amount back, the
expense reads as void and unpaid, and nothing outside this expense moves.
"""
from datetime import datetime

import pytest

from app.domains.expense.domain import ExpenseDomain
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import Expense as ExpenseModel
from models.common import FinancialAccount as FinancialAccountModel
from models.common import Payment as PaymentModel
from models.common import Payout as PayoutModel


def _account(opening=1000.0):
    acc = FinancialAccountModel(uuid="acc-1", account_name="Cash", currency="SYP")
    # opening balance as a received payment; no transactions
    acc.payments = [PaymentModel(uuid="pay-in", amount=opening, currency="SYP", is_deleted=False)]
    acc.transactions_to, acc.transactions_from = [], []
    acc.payouts = []
    return acc


def _expense(uuid, amount, account, paid=(), is_deleted=False):
    exp = ExpenseModel(uuid=uuid, amount=amount, currency="SYP", category="other", is_deleted=is_deleted)
    object.__setattr__(exp, "created_at", datetime(2026, 10, 1, 9, 0))
    payouts = []
    for i, (value, deleted) in enumerate(paid):
        po = PayoutModel(uuid=f"{uuid}-po-{i}", amount=value, currency="SYP",
                         expense_uuid=uuid, financial_account_uuid=account.uuid, is_deleted=deleted)
        object.__setattr__(po, "created_at", datetime(2026, 10, 1, 9, i))
        payouts.append(po)
        account.payouts.append(po)
    exp.payouts = payouts
    return exp


class _Repo:
    def __init__(self, rows):
        self.rows = rows
        self.saved = []

    def find_one(self, uuid=None, is_deleted=None, **_):
        return next((r for r in self.rows if r.uuid == uuid and r.is_deleted == is_deleted), None)

    def find_all(self, is_deleted=None, **filters):
        return [r for r in self.rows
                if r.is_deleted == is_deleted and all(getattr(r, k) == v for k, v in filters.items())]

    def save(self, model, commit=False):
        self.saved.append(model)


class _Uow:
    def __init__(self, expenses):
        self.expense_repository = _Repo(expenses)
        self.payout_repository = _Repo([po for e in expenses for po in e.payouts])


def test_a_paid_expense_can_be_deleted_and_its_payouts_go_with_it():
    acc = _account()
    exp = _expense("exp-1", 300.0, acc, paid=[(200.0, False), (100.0, False)])
    uow = _Uow([exp])

    dto = ExpenseDomain.delete_expense(uuid="exp-1", uow=uow)

    assert exp.is_deleted is True
    assert all(po.is_deleted for po in exp.payouts)
    # the response already reads the expense as void and unpaid
    assert dto.is_deleted is True and dto.amount_paid == 0 and dto.amount_due == 300.0


def test_the_money_goes_back_to_the_account_it_was_paid_from():
    acc = _account(opening=1000.0)
    exp = _expense("exp-1", 300.0, acc, paid=[(300.0, False)])
    assert acc.balance == 700.0

    ExpenseDomain.delete_expense(uuid="exp-1", uow=_Uow([exp]))

    assert acc.balance == 1000.0


def test_nothing_outside_this_expense_moves():
    """Another expense's payout from the same account, and a payout of this
    expense that was already deleted, are left exactly as they were."""
    acc = _account(opening=1000.0)
    mine = _expense("exp-1", 300.0, acc, paid=[(300.0, False), (50.0, True)])
    other = _expense("exp-2", 100.0, acc, paid=[(100.0, False)])
    uow = _Uow([mine, other])

    ExpenseDomain.delete_expense(uuid="exp-1", uow=uow)

    assert other.is_deleted is False and other.payouts[0].is_deleted is False
    assert acc.balance == 1000.0 - 100.0
    # only the live payout of this expense and the expense itself were written
    assert [m.uuid for m in uow.payout_repository.saved] == ["exp-1-po-0"]
    assert [m.uuid for m in uow.expense_repository.saved] == ["exp-1"]


def test_an_unpaid_expense_still_deletes_as_before():
    exp = _expense("exp-1", 80.0, _account())
    uow = _Uow([exp])
    ExpenseDomain.delete_expense(uuid="exp-1", uow=uow)
    assert exp.is_deleted is True and uow.payout_repository.saved == []


def test_an_already_deleted_expense_is_not_found():
    exp = _expense("exp-1", 80.0, _account(), is_deleted=True)
    with pytest.raises(NotFoundError):
        ExpenseDomain.delete_expense(uuid="exp-1", uow=_Uow([exp]))
