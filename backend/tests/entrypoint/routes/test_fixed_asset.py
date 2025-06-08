import uuid
from datetime import datetime
import pytest

from models.common import FixedAsset as FixedAssetModel

# --- CREATE ---

def test_create_fixed_asset_success(client, dummy_uow_class):
    payload = {
        "created_by_uuid":            str(uuid.uuid4()),
        "name":                       "Machine X",
        "description":                "High precision cutter",
        "purchase_date":              "2023-08-15T00:00:00",
        "current_value":              50000.0,
        "annual_depreciation_rate":   5.0,
        "purchase_order_item_uuid":   str(uuid.uuid4()),
        "material_uuid":              str(uuid.uuid4())
    }
    resp = client.post("/fixed_asset/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # echo fields
    assert data["name"]     == payload["name"]
    assert data["description"] == payload["description"]
    assert data["current_value"] == payload["current_value"]
    assert data["annual_depreciation_rate"] == payload["annual_depreciation_rate"]
    assert data["purchase_order_item_uuid"] == payload["purchase_order_item_uuid"]
    assert data["material_uuid"] == payload["material_uuid"]
    # dates
    datetime.fromisoformat(data["purchase_date"])
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False

    # verify save saw correct model
    uow = dummy_uow_class.last_instance
    saved: FixedAssetModel = uow.fixed_asset_repository.saved_model  # type: ignore
    assert saved.name     == payload["name"]
    assert saved.material_uuid == payload["material_uuid"]


def test_create_fixed_asset_validation_error(client):
    # missing required: name, purchase_date, current_value, annual_depreciation_rate, material_uuid
    resp = client.post("/fixed_asset/", json={"description": "oops"})
    assert resp.status_code == 400
    errors = resp.get_json()
    missing = {e["loc"][-1] for e in errors}
    assert "name" in missing
    assert "purchase_date" in missing
    assert "current_value" in missing
    assert "annual_depreciation_rate" in missing
    assert "material_uuid" in missing

# --- GET ---

def test_get_fixed_asset_not_found(client):
    resp = client.get(f"/fixed_asset/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "FixedAsset not found"}


def test_get_fixed_asset_success(client, return_dicts):
    return_single, _ = return_dicts

    fa = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="Press A",
        description="Hydraulic press",
        purchase_date=datetime(2023,1,1,0,0,0),
        current_value=75000.0,
        annual_depreciation_rate=8.0,
        purchase_order_item_uuid=None,
        material_uuid=str(uuid.uuid4()),
        created_at=datetime(2023,1,1,0,0,0),
        is_deleted=False
    )
    return_single["fixed_asset"] = fa

    resp = client.get(f"/fixed_asset/{fa.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["uuid"] == fa.uuid
    assert data["name"] == fa.name
    assert data["purchase_date"] == "2023-01-01T00:00:00"
    assert data["is_deleted"] is False

# --- UPDATE ---

def test_update_fixed_asset_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    fa = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="Old Asset",
        description=None,
        purchase_date=datetime(2022,6,1,0,0,0),
        current_value=30000.0,
        annual_depreciation_rate=10.0,
        purchase_order_item_uuid=None,
        material_uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single["fixed_asset"] = fa

    update_payload = {"current_value": 25000.0, "description": "Updated desc"}
    resp = client.put(f"/fixed_asset/{fa.uuid}", json=update_payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["current_value"] == 25000.0
    assert data["description"]   == "Updated desc"
    assert data["is_deleted"] is False

    uow = dummy_uow_class.last_instance
    saved: FixedAssetModel = uow.fixed_asset_repository.saved_model  # type: ignore
    assert saved.current_value == 25000.0
    assert saved.description == "Updated desc"


def test_update_fixed_asset_not_found(client):
    resp = client.put(f"/fixed_asset/{uuid.uuid4()}", json={"name": "X"})
    assert resp.status_code == 404

# --- DELETE ---

def test_delete_fixed_asset_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    fa = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="Asset",
        description=None,
        purchase_date=datetime.utcnow(),
        current_value=10000.0,
        annual_depreciation_rate=5.0,
        purchase_order_item_uuid=None,
        material_uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single["fixed_asset"] = fa

    resp = client.delete(f"/fixed_asset/{fa.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: FixedAssetModel = uow.fixed_asset_repository.saved_model  # type: ignore
    assert saved.is_deleted is True

# --- LIST ---

def test_list_fixed_assets_default_pagination(client, return_dicts):
    _, return_all = return_dicts

    f1 = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="FA1",
        description=None,
        purchase_date=datetime.utcnow(),
        current_value=1000.0,
        annual_depreciation_rate=2.0,
        purchase_order_item_uuid=None,
        material_uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    f2 = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="FA2",
        description=None,
        purchase_date=datetime.utcnow(),
        current_value=2000.0,
        annual_depreciation_rate=3.0,
        purchase_order_item_uuid=None,
        material_uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all["fixed_asset"] = [f1, f2]

    resp = client.get("/fixed_asset/")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 2
    assert data["page"]        == 1
    assert data["per_page"]    == 20
    assert data["pages"]       == 1
    names = {fa["name"] for fa in data["fixed_assets"]}
    assert names == {"FA1", "FA2"}
    for fa in data["fixed_assets"]:
        assert fa["is_deleted"] is False


def test_list_fixed_assets_filter_purchase_order_item(client, return_dicts):
    _, return_all = return_dicts
    poi_uuid = str(uuid.uuid4())
    fa1 = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="A",
        description=None,
        purchase_date=datetime.utcnow(),
        current_value=500.0,
        annual_depreciation_rate=1.0,
        purchase_order_item_uuid=poi_uuid,
        material_uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all["fixed_asset"] = [fa1]

    resp = client.get(f"/fixed_asset/?purchase_order_item_uuid={poi_uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 1
    assert data["fixed_assets"][0]["purchase_order_item_uuid"] == poi_uuid

def test_list_fixed_assets_filter_material(client, return_dicts):
    _, return_all = return_dicts
    mat_uuid = str(uuid.uuid4())
    fa1 = FixedAssetModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="B",
        description=None,
        purchase_date=datetime.utcnow(),
        current_value=750.0,
        annual_depreciation_rate=2.0,
        purchase_order_item_uuid=None,
        material_uuid=mat_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all["fixed_asset"] = [fa1]

    resp = client.get(f"/fixed_asset/?material_uuid={mat_uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 1
    assert data["fixed_assets"][0]["material_uuid"] == mat_uuid
def test_list_fixed_assets_multi_page(client, return_dicts):
    _, return_all = return_dicts
    all_fa = []
    for i in range(25):
        fa = FixedAssetModel(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            name=f"FA{i}",
            description=None,
            purchase_date=datetime.utcnow(),
            current_value=float(i),
            annual_depreciation_rate=1.0,
            purchase_order_item_uuid=None,
            material_uuid=str(uuid.uuid4()),
            created_at=datetime.utcnow(),
            is_deleted=False
        )
        all_fa.append(fa)
    return_all["fixed_asset"] = all_fa

    resp = client.get("/fixed_asset/?page=2&per_page=20")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"]        == 2
    assert data["per_page"]    == 20
    assert data["pages"]       == 2
    returned = {fa["uuid"] for fa in data["fixed_assets"]}
    expected = {fa.uuid for fa in all_fa[20:]}
    assert returned == expected
