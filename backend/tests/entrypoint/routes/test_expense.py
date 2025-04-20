import uuid
from datetime import datetime
import pytest
from models.common import Expense as ExpenseModel
from app.dto.expense import ExpenseCategory


def test_create_expense_success(client, dummy_uow_class):
    payload = {
        "created_by_uuid": str(uuid.uuid4()),
        "amount": 2500.00,
        "currency": "USD",
        "vendor_uuid": str(uuid.uuid4()),
        "category": ExpenseCategory.RENT.value,
        "description": "April 2025 rent"
    }
    resp = client.post("/expense/", json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["amount"] == payload["amount"]
    assert data["currency"] == payload["currency"]
    assert data["vendor_uuid"] == payload["vendor_uuid"]
    assert data["category"] == payload["category"]
    assert data["description"] == payload["description"]
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])

    uow = dummy_uow_class.last_instance
    saved = uow.expense_repository.saved_model
    assert saved.amount == payload["amount"]
    assert saved.currency == payload["currency"]


def test_create_expense_validation_error(client):
    # missing required fields: amount and currency
    resp = client.post("/expense/", json={"description": "oops"})
    assert resp.status_code == 400
    errors = resp.get_json()
    assert isinstance(errors, list)
    missing = {e["loc"][-1] for e in errors}
    assert "amount" in missing
    assert "currency" in missing


def test_get_expense_not_found(client):
    resp = client.get(f"/expense/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Expense not found"}


def test_get_expense_success(client, return_dicts):
    return_single, _ = return_dicts
    exp = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=99.99,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=ExpenseCategory.MAINTENANCE.value,
        is_deleted=False,
        description="Repair work"
    )
    return_single["expense"] = exp

    resp = client.get(f"/expense/{exp.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["uuid"] == exp.uuid
    assert data["amount"] == exp.amount
    assert data["category"] == exp.category


def test_update_expense_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    exp = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=150.00,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=ExpenseCategory.OTHER.value,
        is_deleted=False,
        description="Misc"
    )
    return_single["expense"] = exp

    update_payload = {"description": "Updated", "amount": 175.50}
    resp = client.put(f"/expense/{exp.uuid}", json=update_payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["description"] == "Updated"
    assert data["amount"] == 175.50

    uow = dummy_uow_class.last_instance
    saved = uow.expense_repository.saved_model
    assert saved.description == "Updated"
    assert saved.amount == 175.50


def test_update_expense_not_found(client):
    resp = client.put(f"/expense/{uuid.uuid4()}", json={"amount": 10})
    assert resp.status_code == 404


def test_delete_expense_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    exp = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=200.00,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=None,
        is_deleted=False,
        description=None
    )
    return_single["expense"] = exp

    resp = client.delete(f"/expense/{exp.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved = uow.expense_repository.saved_model
    assert saved.is_deleted is True


def test_list_expenses(client, return_dicts):
    _, return_all = return_dicts
    e1 = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=10.0,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=None,
        is_deleted=False,
        description=None
    )
    e2 = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=20.0,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=None,
        is_deleted=False,
        description=None
    )
    return_all["expense"] = [e1, e2]

    resp = client.get("/expense/")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 2
    amounts = {item["amount"] for item in data["expenses"]}
    assert amounts == {e1.amount, e2.amount}


def test_list_expenses_filter_by_vendor(client, return_dicts):
    _, return_all = return_dicts

    # two sample expenses with different vendors
    vendor1 = str(uuid.uuid4())
    vendor2 = str(uuid.uuid4())
    e1 = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=100.0,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=vendor1,
        category=None,
        is_deleted=False,
        description="For vendor1"
    )
    e2 = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=200.0,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=vendor2,
        category=None,
        is_deleted=False,
        description="For vendor2"
    )

    # stub the repo to return only e1 when filtering by vendor1
    return_all["expense"] = [e1]

    resp = client.get(f"/expense/?vendor_uuid={vendor1}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 1
    assert len(data["expenses"]) == 1
    assert data["expenses"][0]["vendor_uuid"] == vendor1


def test_list_expenses_filter_by_category(client, return_dicts):
    _, return_all = return_dicts

    # two sample expenses with different categories
    e1 = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=50.0,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=ExpenseCategory.RENT.value,
        is_deleted=False,
        description="Monthly rent"
    )
    e2 = ExpenseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=75.0,
        currency="USD",
        created_at=datetime.utcnow(),
        vendor_uuid=None,
        category=ExpenseCategory.OTHER.value,
        is_deleted=False,
        description="Misc expense"
    )

    # stub the repo to return only the RENT ones
    return_all["expense"] = [e1]

    resp = client.get(f"/expense/?category={ExpenseCategory.RENT.value}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 1
    assert data["expenses"][0]["category"] == ExpenseCategory.RENT.value

