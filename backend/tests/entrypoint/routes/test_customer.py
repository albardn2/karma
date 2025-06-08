import uuid

import pytest
from datetime import datetime
from models.common import Customer as CustomerModel

def test_create_customer_success(client, dummy_uow_class):
    payload = {
        "email_address": "foo@example.com",
        "company_name": "Acme Corp",
        "full_name": "Jane Doe",
        "phone_number": "555-1212",
        "full_address": "123 Main St",
        "business_cards": None,
        "notes": None,
        "category": "roastery",
        "coordinates": None,
        "created_by_uuid": None,
    }

    resp = client.post("/customers/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    assert data["company_name"] == payload["company_name"]
    assert data["email_address"] == payload["email_address"]
    assert data["category"] == payload["category"]
    assert isinstance(data["uuid"], str)
    # should be ISO‑format
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False

    # verify save() saw the right model
    uow = dummy_uow_class.last_instance
    saved: CustomerModel = uow.customer_repository.saved_model
    assert saved.company_name == payload["company_name"]
    assert saved.email_address == payload["email_address"]


def test_create_customer_validation_error(client):
    resp = client.post("/customers/", json={"full_name": "", "company_name": ""})
    assert resp.status_code == 400

    errors = resp.get_json()
    assert isinstance(errors, list)
    assert "loc" in errors[0] and "msg" in errors[0]


def test_get_customer_not_found(client):
    resp = client.get("/customers/does-not-exist")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Customer not found"}


def test_get_customer_success(client, return_dicts):
    return_single, _ = return_dicts

    # prepare a fake CustomerModel
    c = CustomerModel(
        company_name="Beta Ltd",
        full_name="Bob Smith",
        phone_number="800-2000",
        full_address="456 Elm St",
        category="restaurant",
    )
    c.uuid       = "123e4567-e89b-12d3-a456-426614174000"
    c.created_at = datetime(2025, 4, 1, 12, 0, 0)
    c.is_deleted = False

    # tell DummyRepo to return it
    return_single["customer"] = c

    resp = client.get(f"/customers/{c.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["uuid"]         == c.uuid
    assert data["company_name"] == c.company_name
    assert data["full_name"]    == c.full_name
    assert data["is_deleted"]   is False


def test_update_customer_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    c = CustomerModel(
        company_name="Old Co",
        full_name="Old Name",
        phone_number="000-0000",
        full_address="Old Addr",
        category="small_retail",
    )
    c.uuid       = "00000000-0000-0000-0000-000000000000"
    c.created_at = datetime.utcnow()
    c.is_deleted = False

    return_single["customer"] = c

    update_payload = {
        "company_name": "New Co",
        "phone_number": "999-9999",
    }
    resp = client.put(f"/customers/{c.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["company_name"] == "New Co"
    assert data["phone_number"] == "999-9999"

    uow = dummy_uow_class.last_instance
    saved: CustomerModel = uow.customer_repository.saved_model
    assert saved.company_name == "New Co"
    assert saved.phone_number  == "999-9999"


def test_delete_customer_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    c = CustomerModel(
        company_name="ToBeDeleted",
        full_name="Del User",
        phone_number="123-0000",
        full_address="Nowhere",
        category="supermarket",
    )
    c.uuid       = "fedcba98-7654-3210-fedc-ba9876543210"
    c.created_at = datetime.utcnow()
    c.is_deleted = False

    return_single["customer"] = c

    resp = client.delete(f"/customers/{c.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: CustomerModel = uow.customer_repository.saved_model
    assert saved.is_deleted is True


def test_list_customers_paginated(client, return_dicts):
    _, return_all = return_dicts

    c1 = CustomerModel(
        company_name="List1",
        full_name="A",
        phone_number="1",
        full_address="X",
        category="roastery",
    )
    c1.uuid       = "11111111-1111-1111-1111-111111111111"
    c1.created_at = datetime.utcnow()
    c1.is_deleted = False

    c2 = CustomerModel(
        company_name="List2",
        full_name="B",
        phone_number="2",
        full_address="Y",
        category="restaurant",
    )
    c2.uuid       = "22222222-2222-2222-2222-222222222222"
    c2.created_at = datetime.utcnow()
    c2.is_deleted = False

    # stub repo to return exactly these two
    return_all["customer"] = [c1, c2]

    # default page=1, per_page=20
    resp = client.get("/customers/")
    assert resp.status_code == 200

    data = resp.get_json()
    # pagination envelope
    assert isinstance(data["customers"], list)
    assert data["total_count"] == 2
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert data["pages"] == 1

    uuids = {c["uuid"] for c in data["customers"]}
    assert uuids == {c1.uuid, c2.uuid}


def test_list_customers_multi_page(client, return_dicts):
    _, return_all = return_dicts

    # create 25 fake customers
    all_customers = []
    for i in range(25):
        c = CustomerModel(
            company_name=f"Co {i}",
            full_name=str(i),
            phone_number=str(i),
            full_address="X",
            category="roastery",
        )
        c.uuid       = str(uuid.uuid4())
        c.created_at = datetime.utcnow()
        c.is_deleted = False
        all_customers.append(c)

    return_all["customer"] = all_customers

    # ask for page 2 of 20
    resp = client.get("/customers/?page=2&per_page=20")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"] == 2
    assert data["per_page"] == 20
    assert data["pages"] == 2

    # only 5 items on second page
    assert len(data["customers"]) == 5
    expected_uuids = {c.uuid for c in all_customers[20:]}
    returned_uuids = {c["uuid"] for c in data["customers"]}
    assert returned_uuids == expected_uuids
