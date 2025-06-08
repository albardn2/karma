import uuid

import pytest
from datetime import datetime
from models.common import Material as MaterialModel
from app.dto.material import MaterialType

def test_create_material_success(client, dummy_uow_class):
    payload = {
        "name": "Steel Rod",
        "measure_unit": "kg",
        "sku": "SR-100",
        "description": "Stainless steel rod",
        "type": MaterialType.RAW_MATERIAL.value,
        "created_by_uuid": None,
    }

    resp = client.post("/materials/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # basic field echo
    assert data["name"] == payload["name"]
    assert data["sku"] == payload["sku"]
    assert data["type"] == payload["type"]
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])
    # created_by_uuid was None
    assert data.get("created_by_uuid") is None

    # verify save() saw the right model
    uow = dummy_uow_class.last_instance
    saved: MaterialModel = uow.material_repository.saved_model
    assert saved.name == payload["name"]
    assert saved.sku  == payload["sku"]
    assert saved.type == payload["type"]


def test_create_material_validation_error(client):
    # omit required fields: name, sku, type
    resp = client.post("/materials/", json={"measure_unit": "kg"})
    assert resp.status_code == 400

    errors = resp.get_json()
    assert isinstance(errors, list)
    # should mention missing 'name' and/or 'sku' and 'type'
    missing = {e["loc"][-1] for e in errors}
    assert "name" in missing
    assert "sku" in missing
    assert "type" in missing


def test_get_material_not_found(client):
    resp = client.get("/materials/does-not-exist")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Material not found"}


def test_get_material_success(client, return_dicts):
    return_single, _ = return_dicts

    # fake MaterialModel
    m = MaterialModel(
        name="Aluminum Sheet",
        measure_unit="kg",
        sku="AS-200",
        description="Aluminum alloy sheet",
        type=MaterialType.PRODUCT.value,
    )
    m.uuid       = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    m.created_at = datetime(2025, 4, 1, 10, 30, 0)
    # note: we soft-delete via is_deleted on material routes
    m.is_deleted = False

    return_single["material"] = m

    resp = client.get(f"/materials/{m.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["uuid"]        == m.uuid
    assert data["name"]        == m.name
    assert data["sku"]         == m.sku
    assert data["type"]        == m.type


def test_update_material_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    m = MaterialModel(
        name="Copper Wire",
        measure_unit="kg",
        sku="CW-300",
        description="Bare copper wire",
        type=MaterialType.INTERIM.value,
    )
    m.uuid       = "11112222-3333-4444-5555-666677778888"
    m.created_at = datetime.utcnow()
    m.is_deleted = False

    return_single["material"] = m

    update_payload = {
        "description": "PVC‑insulated copper wire",
        "measure_unit": "kg"
    }
    resp = client.put(f"/materials/{m.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["description"] == update_payload["description"]
    assert data["measure_unit"]        == update_payload["measure_unit"]

    uow = dummy_uow_class.last_instance
    saved: MaterialModel = uow.material_repository.saved_model
    assert saved.description == update_payload["description"]
    assert saved.measure_unit        == update_payload["measure_unit"]


def test_delete_material_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    m = MaterialModel(
        name="Iron Ingot",
        measure_unit="kg",
        sku="II-400",
        description="Cast iron ingot",
        type=MaterialType.RAW_MATERIAL.value,
    )
    m.uuid       = "99998888-7777-6666-5555-444433332222"
    m.created_at = datetime.utcnow()
    m.is_deleted = False

    return_single["material"] = m

    resp = client.delete(f"/materials/{m.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: MaterialModel = uow.material_repository.saved_model
    assert saved.is_deleted is True


def test_list_materials_paginated(client, return_dicts):
    _, return_all = return_dicts

    m1 = MaterialModel(
        name="Lead Plate",
        measure_unit="pcs",
        sku="LP-500",
        description="Lead plating plate",
        type=MaterialType.INTERIM.value,
    )
    m1.uuid       = "aaaa1111-bbbb-2222-cccc-3333dddd4444"
    m1.created_at = datetime.utcnow()
    m1.is_deleted = False

    m2 = MaterialModel(
        name="Gold Nugget",
        measure_unit="kg",
        sku="GN-600",
        description="Raw gold nugget",
        type=MaterialType.FIXED_ASSET.value,
    )
    m2.uuid       = "dddd3333-eeee-4444-ffff-555566667777"
    m2.created_at = datetime.utcnow()
    m2.is_deleted = False

    return_all["material"] = [m1, m2]

    resp = client.get("/materials/")
    assert resp.status_code == 200

    data = resp.get_json()
    # pagination envelope
    assert isinstance(data["materials"], list)
    assert data["total_count"] == 2
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert data["pages"] == 1

    skus = {item["sku"] for item in data["materials"]}
    assert skus == {m1.sku, m2.sku}


def test_list_materials_multi_page(client, return_dicts):
    _, return_all = return_dicts

    # 25 dummy materials
    mats = []
    for i in range(25):
        m = MaterialModel(
            name=f"Mat {i}",
            measure_unit="kg",
            sku=f"M-{i:03}",
            description=f"Mat {i}",
            type=MaterialType.INTERIM.value,
        )
        m.uuid       = str(uuid.uuid4())
        m.created_at = datetime.utcnow()
        m.is_deleted = False
        mats.append(m)

    return_all["material"] = mats

    # request page 2 with per_page=20
    resp = client.get("/materials/?page=2&per_page=20")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"] == 2
    assert data["per_page"] == 20
    assert data["pages"] == 2

    # only 5 items on the second page
    assert len(data["materials"]) == 5

    expected_skus = {m.sku for m in mats[20:]}
    returned_skus = {item["sku"] for item in data["materials"]}
    assert returned_skus == expected_skus
