import uuid
from datetime import datetime
import pytest

from models.common import FinancialAccount as FinancialAccountModel
from app.dto.common_enums import Currency

# --- CREATE ---

def test_create_account_success(client, dummy_uow_class):
    payload = {
        "created_by_uuid": str(uuid.uuid4()),
        "account_name":    "Savings Account",
        "balance":         5000.00,
        "currency":        Currency.USD.value,
        "notes":           "Emergency fund"
    }
    resp = client.post("/financial_account/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # echo fields
    assert data["account_name"] == payload["account_name"]
    assert data["balance"]      == payload["balance"]
    assert data["currency"]     == payload["currency"]
    assert data["notes"]        == payload["notes"]
    # defaults and metadata
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False

    # verify save saw the right model
    uow = dummy_uow_class.last_instance
    saved: FinancialAccountModel = uow.financial_account_repository.saved_model  # type: ignore
    assert saved.account_name == payload["account_name"]
    assert saved.balance      == payload["balance"]
    assert saved.currency     == payload["currency"]


def test_create_account_validation_error(client):
    # missing required fields: account_name, balance, currency
    resp = client.post("/financial_account/", json={"notes": "oops"})
    assert resp.status_code == 400
    errors = resp.get_json()
    assert isinstance(errors, list)
    missing = {e["loc"][-1] for e in errors}
    assert "account_name" in missing
    assert "balance" in missing
    assert "currency" in missing

# --- GET ---

def test_get_account_not_found(client):
    resp = client.get(f"/financial_account/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "FinancialAccount not found"}


def test_get_account_success(client, return_dicts):
    return_single, _ = return_dicts

    acct = FinancialAccountModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        account_name="Main Checking",
        balance=1200.50,
        currency=Currency.USD.value,
        created_at=datetime(2025, 4, 1, 9, 0, 0),
        notes="Operating funds",
        is_deleted=False
    )
    return_single["financial_account"] = acct

    resp = client.get(f"/financial_account/{acct.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["uuid"]        == acct.uuid
    assert data["account_name"]== acct.account_name
    assert data["balance"]     == acct.balance
    assert data["currency"]    == acct.currency
    assert data["notes"]       == acct.notes
    assert data["is_deleted"]  is False
    # metadata
    assert data["created_at"]  == "2025-04-01T09:00:00"

# --- UPDATE ---

def test_update_account_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    acct = FinancialAccountModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        account_name="Old Name",
        balance=100.00,
        currency=Currency.USD.value,
        created_at=datetime.utcnow(),
        notes=None,
        is_deleted=False
    )
    return_single["financial_account"] = acct

    update_payload = {"balance": 200.00, "notes": "Updated"}
    resp = client.put(f"/financial_account/{acct.uuid}", json=update_payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["balance"] == 200.00
    assert data["notes"]   == "Updated"

    uow = dummy_uow_class.last_instance
    saved: FinancialAccountModel = uow.financial_account_repository.saved_model  # type: ignore
    assert saved.balance == 200.00
    assert saved.notes  == "Updated"


def test_update_account_not_found(client):
    resp = client.put(f"/financial_account/{uuid.uuid4()}", json={"balance": 1})
    assert resp.status_code == 404

# --- DELETE (soft) ---

def test_delete_account_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    acct = FinancialAccountModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        account_name="To Delete",
        balance=0.0,
        currency=Currency.USD.value,
        created_at=datetime.utcnow(),
        notes=None,
        is_deleted=False
    )
    return_single["financial_account"] = acct

    resp = client.delete(f"/financial_account/{acct.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: FinancialAccountModel = uow.financial_account_repository.saved_model  # type: ignore
    assert saved.is_deleted is True

# --- LIST (paginated) ---

def test_list_accounts_default_pagination(client, return_dicts):
    _, return_all = return_dicts

    a1 = FinancialAccountModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        account_name="A1",
        balance=10.0,
        currency=Currency.USD.value,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    a2 = FinancialAccountModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        account_name="A2",
        balance=20.0,
        currency=Currency.USD.value,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all["financial_account"] = [a1, a2]

    resp = client.get("/financial_account/")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 2
    assert data["page"]        == 1
    assert data["per_page"]    == 20
    assert data["pages"]       == 1
    names = {acct["account_name"] for acct in data["accounts"]}
    assert names == {"A1", "A2"}


def test_list_accounts_multi_page(client, return_dicts):
    _, return_all = return_dicts
    all_accts = []
    for i in range(25):
        acct = FinancialAccountModel(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            account_name=f"Acct{i}",
            balance=float(i),
            currency=Currency.USD.value,
            created_at=datetime.utcnow(),
            is_deleted=False
        )
        all_accts.append(acct)
    return_all["financial_account"] = all_accts

    resp = client.get("/financial_account/?page=2&per_page=20")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"]        == 2
    assert data["per_page"]    == 20
    assert data["pages"]       == 2
    assert len(data["accounts"]) == 5
    expected = {acct.uuid for acct in all_accts[20:]}
    returned = {acct["uuid"] for acct in data["accounts"]}
    assert returned == expected
