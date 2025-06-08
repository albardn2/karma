import uuid
import pytest
from datetime import datetime

from models.common import Transaction as TransactionModel, FinancialAccount
from app.domains.transaction.domain import TransactionDomain
from app.dto.transaction import TransactionCreate
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from app.dto.common_enums import Currency

# --- CREATE TRANSACTION ---

def test_create_transaction_no_accounts_raises(return_dicts, dummy_uow_class):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)
    payload = TransactionCreate(
        amount=100.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes='no accounts',
        created_by_uuid=str(uuid.uuid4())
    )
    with pytest.raises(BadRequestError) as excinfo:
        TransactionDomain.create_transaction(uow, payload)
    assert 'Transaction must have at least one account' in str(excinfo.value)


def test_create_transaction_from_account_balance_decrement(return_dicts, dummy_uow_class, monkeypatch):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)
    acct_uuid = str(uuid.uuid4())
    payload = TransactionCreate(
        amount=40.0,
        currency=Currency.USD.value,
        from_account_uuid=acct_uuid,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes='from only',
        created_by_uuid=str(uuid.uuid4())
    )
    # Monkey-patch TransactionModel to attach a FinancialAccount relationship
    orig_init = TransactionModel.__init__
    def init_and_attach(self, **kwargs):
        orig_init(self, **kwargs)
        # attach from_account with initial balance
        self.from_account = FinancialAccount(uuid=acct_uuid, is_deleted=False, balance=200.0)
        self.to_account = None
    monkeypatch.setattr(TransactionModel, '__init__', init_and_attach)

    result = TransactionDomain.create_transaction(uow, payload)
    saved_acct = uow.financial_account_repository.saved_model
    assert saved_acct.balance == pytest.approx(160.0)
    assert result.amount == payload.amount


def test_create_transaction_to_account_balance_increment(return_dicts, dummy_uow_class, monkeypatch):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)
    acct_uuid = str(uuid.uuid4())
    payload = TransactionCreate(
        amount=25.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=acct_uuid,
        exchange_rate=1.0,
        notes='to only',
        created_by_uuid=str(uuid.uuid4())
    )
    orig_init = TransactionModel.__init__
    def init_and_attach(self, **kwargs):
        orig_init(self, **kwargs)
        self.from_account = None
        self.to_account = FinancialAccount(uuid=acct_uuid, is_deleted=False, balance=50.0)
    monkeypatch.setattr(TransactionModel, '__init__', init_and_attach)

    result = TransactionDomain.create_transaction(uow, payload)
    saved_acct = uow.financial_account_repository.saved_model
    assert saved_acct.balance == pytest.approx(75.0)
    assert result.amount == payload.amount


def test_create_transaction_deleted_account_raises(return_dicts, dummy_uow_class, monkeypatch):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)
    acct_uuid = str(uuid.uuid4())
    payload = TransactionCreate(
        amount=10.0,
        currency=Currency.USD.value,
        from_account_uuid=acct_uuid,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes='deleted',
        created_by_uuid=str(uuid.uuid4())
    )
    orig_init = TransactionModel.__init__
    def init_and_attach(self, **kwargs):
        orig_init(self, **kwargs)
        self.from_account = FinancialAccount(uuid=acct_uuid, is_deleted=True, balance=100.0)
        self.to_account = None
    monkeypatch.setattr(TransactionModel, '__init__', init_and_attach)

    with pytest.raises(BadRequestError) as excinfo:
        TransactionDomain.create_transaction(uow, payload)
    assert 'Cannot use a deleted account' in str(excinfo.value)

# --- DELETE TRANSACTION ---

def test_delete_transaction_not_found(return_dicts, dummy_uow_class):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)
    with pytest.raises(NotFoundError) as excinfo:
        TransactionDomain.delete_transaction(uow, str(uuid.uuid4()))
    assert 'Transaction not found' in str(excinfo.value)


def test_delete_transaction_success(return_dicts, dummy_uow_class):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)
    # Create real FinancialAccount models
    from_acct = FinancialAccount(uuid=str(uuid.uuid4()), is_deleted=False, balance=20.0)
    to_acct = FinancialAccount(uuid=str(uuid.uuid4()), is_deleted=False, balance=5.0)
    # Create TransactionModel and assign accounts
    tx = TransactionModel(
        amount=15.0,
        currency=Currency.USD.value,
        from_account_uuid=from_acct.uuid,
        to_account_uuid=to_acct.uuid,
        exchange_rate=1.0,
        notes='',
        created_by_uuid=None
    )
    tx.from_account = from_acct
    tx.to_account = to_acct
    tx.is_deleted = False
    tx.uuid = str(uuid.uuid4())
    tx.created_at = datetime.utcnow()
    return_single['transaction'] = tx

    result = TransactionDomain.delete_transaction(uow, tx.uuid)
    assert from_acct.balance == pytest.approx(35.0)
    assert to_acct.balance == pytest.approx(-10.0)
    saved_acct = uow.financial_account_repository.saved_model
    assert saved_acct in (from_acct, to_acct)
    saved_tx = uow.transaction_repository.saved_model
    assert saved_tx.is_deleted is True
    assert result.is_deleted is True
