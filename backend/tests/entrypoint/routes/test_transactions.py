import uuid
from datetime import datetime
import pytest

from models.common import Transaction as TransactionModel
from app.dto.common_enums import Currency
from app.dto.transaction import (
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    TransactionListParams,
    TransactionPage,
)
from app.domains.transaction.domain import TransactionDomain
from app.entrypoint.routes.common.errors import NotFoundError

# --- CREATE ---

def test_create_transaction_success(client, monkeypatch):
    # Mock the domain to return a TransactionRead DTO
    fake_uuid = str(uuid.uuid4())
    created_at = datetime.utcnow()
    fake_dto = TransactionRead(
        uuid=fake_uuid,
        amount=50.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes="Test",
        created_by_uuid=str(uuid.uuid4()),
        created_at=created_at,
        is_deleted=False,
    )
    monkeypatch.setattr(
        TransactionDomain,
        "create_transaction",
        lambda uow, payload: fake_dto,
    )

    payload = {
        "amount": fake_dto.amount,
        "currency": fake_dto.currency,
        "from_account_uuid": fake_dto.from_account_uuid,
        "to_account_uuid": fake_dto.to_account_uuid,
        "exchange_rate": fake_dto.exchange_rate,
        "notes": fake_dto.notes,
        "created_by_uuid": fake_dto.created_by_uuid,
    }
    resp = client.post("/transaction/", json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data == fake_dto.model_dump(mode="json")

# --- GET ---

def test_get_transaction_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        client.get(f"/transaction/{uuid.uuid4()}")
    assert str(excinfo.value) == "Transaction not found"


def test_get_transaction_success(client, return_dicts):
    return_single, _ = return_dicts
    # Build a TransactionModel instance
    tx = TransactionModel(
        uuid=str(uuid.uuid4()),
        amount=20.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes="",
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        is_deleted=False,
    )
    return_single["transaction"] = tx

    resp = client.get(f"/transaction/{tx.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["uuid"] == tx.uuid
    assert data["amount"] == tx.amount

# --- UPDATE ---

def test_update_transaction_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    tx = TransactionModel(
        uuid=str(uuid.uuid4()),
        amount=30.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes="Old",
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        is_deleted=False,
    )
    return_single["transaction"] = tx

    update_payload = {"notes": "New Note"}
    resp = client.put(f"/transaction/{tx.uuid}", json=update_payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["notes"] == update_payload["notes"]

    uow = dummy_uow_class.last_instance
    saved: TransactionModel = uow.transaction_repository.saved_model
    assert saved.notes == update_payload["notes"]


def test_update_transaction_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        client.put(f"/transaction/{uuid.uuid4()}", json={"notes": "X"})
    assert str(excinfo.value) == "Transaction not found"

# --- DELETE ---

def test_delete_transaction_success(client, monkeypatch):
    # Mock the domain to return a TransactionRead DTO
    fake_uuid = str(uuid.uuid4())
    created_at = datetime.utcnow()
    fake_dto = TransactionRead(
        uuid=fake_uuid,
        amount=75.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes="DeleteTest",
        created_by_uuid=str(uuid.uuid4()),
        created_at=created_at,
        is_deleted=True,
    )
    monkeypatch.setattr(
        TransactionDomain,
        "delete_transaction",
        lambda uow, uuid_str: fake_dto,
    )

    resp = client.delete(f"/transaction/{fake_uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data == fake_dto.model_dump(mode="json")

# --- LIST ---

def test_list_transactions_default_pagination(client, return_dicts):
    _, return_all = return_dicts
    tx1 = TransactionModel(
        uuid=str(uuid.uuid4()),
        amount=10.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes="",
        created_by_uuid=None,
        created_at=datetime(2025,1,1),
        is_deleted=False,
    )
    tx2 = TransactionModel(
        uuid=str(uuid.uuid4()),
        amount=20.0,
        currency=Currency.USD.value,
        from_account_uuid=None,
        to_account_uuid=None,
        exchange_rate=1.0,
        notes="",
        created_by_uuid=None,
        created_at=datetime(2025,2,1),
        is_deleted=False,
    )
    return_all["transaction"] = [tx1, tx2]

    resp = client.get("/transaction/")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 2
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert data["pages"] == 1
    uuids = {t["uuid"] for t in data["transactions"]}
    assert uuids == {tx1.uuid, tx2.uuid}
