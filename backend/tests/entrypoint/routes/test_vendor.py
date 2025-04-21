import uuid
from datetime import datetime
import pytest
from models.common import Vendor as VendorModel
from app.dto.vendor import VendorCategory


def test_create_vendor_success(client, dummy_uow_class):
    payload = {
        "email_address": "alice.smith@acmesupplies.com",
        "company_name": "Acme Supplies Co.",
        "full_name": "Alice Smith",
        "phone_number": "+1-555-987-6543",
        "full_address": "456 Supplier Street, Supply City, CA 90210",
        "business_cards": "https://cdn.example.com/cards/alice_smith.png",
        "notes": "Preferred vendor for packaging materials",
        "category": VendorCategory.OTHER.value,
        "coordinates": "37.7749,-122.4194"
    }

    resp = client.post("/vendor/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # basic field echo
    assert data["company_name"] == payload["company_name"]
    assert data["full_name"] == payload["full_name"]
    assert data["category"] == payload["category"]
    assert isinstance(data["uuid"], str)
    # validate datetime format
    datetime.fromisoformat(data["created_at"])

    # verify save() saw the right model
    uow = dummy_uow_class.last_instance
    saved: VendorModel = uow.vendor_repository.saved_model
    assert saved.company_name == payload["company_name"]
    assert saved.full_name == payload["full_name"]
    assert saved.category == payload["category"]


def test_create_vendor_validation_error(client):
    # omit required fields: company_name, full_name, phone_number
    resp = client.post("/vendor/", json={"email_address": "not-an-email"})
    assert resp.status_code == 400

    errors = resp.get_json()
    assert isinstance(errors, list)
    missing = {e["loc"][-1] for e in errors}
    assert "company_name" in missing
    assert "full_name" in missing
    assert "phone_number" in missing


def test_get_vendor_not_found(client):
    resp = client.get(f"/vendor/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Vendor not found"}


def test_get_vendor_success(client, return_dicts):
    return_single, _ = return_dicts

    v = VendorModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address="bob@vendor.com",
        company_name="Bob's Goods",
        full_name="Bob Vendor",
        phone_number="+1-555-000-1111",
        full_address="789 Vendor Blvd, Vendor City",
        business_cards=None,
        notes=None,
        category=VendorCategory.OTHER.value,
        coordinates=None,
        is_deleted=False
    )
    return_single["vendor"] = v

    resp = client.get(f"/vendor/{v.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["uuid"] == v.uuid
    assert data["company_name"] == v.company_name
    assert data["category"] == v.category


def test_update_vendor_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    v = VendorModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address="sam@supplies.com",
        company_name="Sam Supplies",
        full_name="Sam Old",
        phone_number="+1-555-222-3333",
        full_address="101 Supply St",
        business_cards=None,
        notes=None,
        category=VendorCategory.OTHER.value,
        coordinates=None,
        is_deleted=False
    )
    return_single["vendor"] = v

    update_payload = {"full_name": "Sam New", "category": VendorCategory.OTHER.value}
    resp = client.put(f"/vendor/{v.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["full_name"] == "Sam New"
    assert data["category"] == update_payload["category"]

    uow = dummy_uow_class.last_instance
    saved: VendorModel = uow.vendor_repository.saved_model
    assert saved.full_name == update_payload["full_name"]
    assert saved.category == update_payload["category"]


def test_delete_vendor_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    v = VendorModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address=None,
        company_name="Del Supplies",
        full_name="Delete Me",
        phone_number="+1-555-444-5555",
        full_address=None,
        business_cards=None,
        notes=None,
        category=None,
        coordinates=None,
        is_deleted=False
    )
    return_single["vendor"] = v

    resp = client.delete(f"/vendor/{v.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: VendorModel = uow.vendor_repository.saved_model
    assert saved.is_deleted is True


def test_list_vendors_paginated(client, return_dicts):
    _, return_all = return_dicts

    v1 = VendorModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address=None,
        company_name="List One",
        full_name="One",
        phone_number="+1-555-666-7777",
        full_address=None,
        business_cards=None,
        notes=None,
        category=None,
        coordinates=None,
        is_deleted=False
    )
    v2 = VendorModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address=None,
        company_name="List Two",
        full_name="Two",
        phone_number="+1-555-888-9999",
        full_address=None,
        business_cards=None,
        notes=None,
        category=None,
        coordinates=None,
        is_deleted=False
    )
    return_all["vendor"] = [v1, v2]

    resp = client.get("/vendor/")
    assert resp.status_code == 200

    data = resp.get_json()
    # pagination envelope
    assert isinstance(data["vendors"], list)
    assert data["total_count"] == 2
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert data["pages"] == 1

    names = {item["company_name"] for item in data["vendors"]}
    assert names == {v1.company_name, v2.company_name}


def test_list_vendors_multi_page(client, return_dicts):
    _, return_all = return_dicts

    # create 25 fake vendors
    all_vendors = []
    for i in range(25):
        v = VendorModel(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            created_at=datetime.utcnow(),
            email_address=None,
            company_name=f"Vendor {i}",
            full_name=str(i),
            phone_number=str(1000 + i),
            full_address=None,
            business_cards=None,
            notes=None,
            category=None,
            coordinates=None,
            is_deleted=False
        )
        all_vendors.append(v)

    return_all["vendor"] = all_vendors

    # request page 2 with 20 per page
    resp = client.get("/vendor/?page=2&per_page=20")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"] == 2
    assert data["per_page"] == 20
    assert data["pages"] == 2

    # only 5 items on second page
    assert len(data["vendors"]) == 5

    expected = {v.company_name for v in all_vendors[20:]}
    returned = {item["company_name"] for item in data["vendors"]}
    assert returned == expected

