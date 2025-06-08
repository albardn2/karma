import uuid
from datetime import datetime
import pytest

from models.common import Pricing as PricingModel, Material as MaterialModel
from app.dto.common_enums import UnitOfMeasure

# --- CREATE ---

def test_create_pricing_success(client, dummy_uow_class):
    payload = {
        "created_by_uuid": str(uuid.uuid4()),
        "material_uuid":   str(uuid.uuid4()),
        "price_per_unit":  3.75,
        "currency":        "USD"
    }
    resp = client.post("/pricing/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # echo fields
    assert data["material_uuid"]  == payload["material_uuid"]
    assert data["price_per_unit"] == payload["price_per_unit"]
    assert data["currency"]       == payload["currency"]
    # defaults
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False
    # unit must be present (even if dummy)
    assert "unit" in data

    uow = dummy_uow_class.last_instance
    saved: PricingModel = uow.pricing_repository.saved_model
    assert saved.material_uuid  == payload["material_uuid"]
    assert saved.price_per_unit == payload["price_per_unit"]
    assert saved.currency       == payload["currency"]


def test_create_pricing_validation_error(client):
    resp = client.post("/pricing/", json={"material_uuid": str(uuid.uuid4())})
    assert resp.status_code == 400
    errors = resp.get_json()
    missing = {e["loc"][-1] for e in errors}
    assert "price_per_unit" in missing
    assert "currency" in missing


# --- GET ---

def test_get_pricing_not_found(client):
    resp = client.get(f"/pricing/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Pricing not found"}


def test_get_pricing_success(client, return_dicts):
    return_single, _ = return_dicts

    # create real MaterialModel and set unit
    material = MaterialModel(
        uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        measure_unit = UnitOfMeasure.KG.value
    )
    material.unit = UnitOfMeasure.KG.value

    pr = PricingModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid=material.uuid,
        price_per_unit=5.25,
        currency="EUR",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    pr.material = material  # attach real relationship

    return_single["pricing"] = pr

    resp = client.get(f"/pricing/{pr.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["uuid"]           == pr.uuid
    assert data["material_uuid"]  == pr.material_uuid
    assert data["price_per_unit"] == pr.price_per_unit
    assert data["currency"]       == pr.currency
    assert data["unit"]           == UnitOfMeasure.KG.value


# --- UPDATE ---

def test_update_pricing_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    material = MaterialModel(
        uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
    )
    material.measure_unit = UnitOfMeasure.PCS.value

    pr = PricingModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid=material.uuid,
        price_per_unit=2.50,
        currency="USD",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    pr.material = material

    return_single["pricing"] = pr

    update_payload = {"price_per_unit": 4.00, "currency": "GBP"}
    resp = client.put(f"/pricing/{pr.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["price_per_unit"] == 4.00
    assert data["currency"]       == "GBP"
    assert data["unit"]           == UnitOfMeasure.PCS.value

    uow = dummy_uow_class.last_instance
    saved: PricingModel = uow.pricing_repository.saved_model
    assert saved.price_per_unit == 4.00
    assert saved.currency       == "GBP"


def test_update_pricing_not_found(client):
    resp = client.put(f"/pricing/{uuid.uuid4()}", json={"price_per_unit": 1.23})
    assert resp.status_code == 404


# --- DELETE (soft) ---

def test_delete_pricing_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    material = MaterialModel(
        uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
    )
    material.measure_unit = UnitOfMeasure.PCS.value

    pr = PricingModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid=material.uuid,
        price_per_unit=7.50,
        currency="USD",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    pr.material = material

    return_single["pricing"] = pr

    resp = client.delete(f"/pricing/{pr.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["is_deleted"] is True
    assert data["unit"]       == UnitOfMeasure.PCS.value

    uow = dummy_uow_class.last_instance
    saved: PricingModel = uow.pricing_repository.saved_model
    assert saved.is_deleted is True


# --- LIST (paginated) ---

def test_list_pricings_paginated(client, return_dicts):
    _, return_all = return_dicts

    material1 = MaterialModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
    material1.measure_unit = UnitOfMeasure.KG.value
    p1 = PricingModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid=material1.uuid,
        price_per_unit=1.0,
        currency="USD",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    p1.material = material1

    material2 = MaterialModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
    material2.measure_unit = UnitOfMeasure.PCS.value
    p2 = PricingModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid=material2.uuid,
        price_per_unit=2.0,
        currency="EUR",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    p2.material = material2

    return_all["pricing"] = [p1, p2]

    resp = client.get("/pricing/")
    assert resp.status_code == 200

    data = resp.get_json()
    assert isinstance(data["pricings"], list)
    assert data["total_count"] == 2
    assert data["page"]        == 1
    assert data["per_page"]    == 20
    assert data["pages"]       == 1

    units = {item["unit"] for item in data["pricings"]}
    assert units == {UnitOfMeasure.KG.value, UnitOfMeasure.PCS.value}


def test_list_pricings_multi_page(client, return_dicts):
    _, return_all = return_dicts

    all_pages = []
    for i in range(25):
        material = MaterialModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
        material.measure_unit = UnitOfMeasure.PCS.value
        pr = PricingModel(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            material_uuid=material.uuid,
            price_per_unit=float(i),
            currency="USD",
            created_at=datetime.utcnow(),
            is_deleted=False
        )
        pr.material = material
        all_pages.append(pr)

    return_all["pricing"] = all_pages

    resp = client.get("/pricing/?page=2&per_page=20")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"]        == 2
    assert data["per_page"]    == 20
    assert data["pages"]       == 2

    assert len(data["pricings"]) == 5
    expected = {pr.uuid for pr in all_pages[20:]}
    returned = {item["uuid"] for item in data["pricings"]}
    assert returned == expected
