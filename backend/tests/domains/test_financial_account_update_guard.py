"""Currency is frozen on a financial account that has money history (QA MON-FIN-4).

Switching an account's currency once payments, payouts or transactions point at it
would restate its whole balance in another currency. The guard must key on the
currency CHANGING, not on the field being MENTIONED: a client that sends the full
record with the same currency is renaming the account, not converting it.
"""
from datetime import datetime

import pytest

from app.domains.financial_account.domain import FinancialAccountDomain
from app.dto.financial_account import FinancialAccountUpdate
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import FinancialAccount as FinancialAccountModel

ACCOUNT_UUID = "fa-1"
ORIGINAL_CURRENCY = "USD"
OTHER_CURRENCY = "SYP"


def make_account() -> FinancialAccountModel:
    acc = FinancialAccountModel(
        uuid=ACCOUNT_UUID,
        account_name="Shop wallet",
        currency=ORIGINAL_CURRENCY,
        is_external=True,
        notes=None,
    )
    # column defaults fire only on flush, and these tests never flush
    object.__setattr__(acc, "is_deleted", False)
    object.__setattr__(acc, "created_at", datetime(2026, 7, 1, 12, 0, 0))
    object.__setattr__(acc, "created_by_uuid", None)
    return acc


class _Repo:
    """find_one returns the account; find_first answers whether a relation exists."""

    def __init__(self, account=None, has_relation=False):
        self._account = account
        self._has_relation = has_relation
        self.saved = None

    def find_one(self, **_kwargs):
        return self._account

    def find_first(self, **_kwargs):
        return object() if self._has_relation else None

    def save(self, model, commit=False):
        self.saved = model


class _Uow:
    def __init__(self, has_relation: bool):
        self.account = make_account()
        self.financial_account_repository = _Repo(self.account)
        related = _Repo(has_relation=has_relation)
        self.payment_repository = related
        self.payout_repository = related
        self.transaction_repository = related


@pytest.fixture(autouse=True)
def _read_balance_without_a_db(monkeypatch):
    # FinancialAccountRead reads the balance property, which queries the ledger
    monkeypatch.setattr(FinancialAccountModel, "balance", property(lambda self: 0.0))


def _update(uow: _Uow, **fields):
    return FinancialAccountDomain.update_financial_account(
        uow=uow, uuid=ACCOUNT_UUID, payload=FinancialAccountUpdate(**fields)
    )


def test_changing_currency_is_refused_when_the_account_has_history():
    uow = _Uow(has_relation=True)

    with pytest.raises(BadRequestError):
        _update(uow, currency=OTHER_CURRENCY)

    assert uow.account.currency == ORIGINAL_CURRENCY, uow.account.currency


def test_resending_the_same_currency_with_a_rename_is_allowed_with_history():
    uow = _Uow(has_relation=True)

    result = _update(uow, account_name="Shop wallet (old)", currency=ORIGINAL_CURRENCY)

    assert result.account_name == "Shop wallet (old)", result
    assert uow.account.currency == ORIGINAL_CURRENCY, uow.account.currency


def test_changing_currency_is_allowed_on_an_account_with_no_history():
    uow = _Uow(has_relation=False)

    result = _update(uow, currency=OTHER_CURRENCY)

    assert result.currency.value == OTHER_CURRENCY, result
