import uuid
from datetime import datetime
import pytest

from models.common import Warehouse as WarehouseModel

# --- CREATE ---

def test_create_warehouse_success(client, dummy_uow_class):
    payload = {
        "created_by_uuid": str(uuid.uuid4()),
        "name":            "Main Depot",
        "address":         "100 Logistics Way",
        "coordinates":     "37.7749,-122.4194",
        "notes":           "Primary warehouse"
    }
    resp = client.post("/warehouse/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # echo fields
    assert data["name"]        == payload["name"]
    assert data["address"]     == payload["address"]
    assert data["coordinates"] == payload["coordinates"]
    assert data["notes"]       == payload["notes"]
    # defaults and metadata
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False

    # verify save saw the right model
    uow = dummy_uow_class.last_instance
    saved: WarehouseModel = uow.warehouse_repository.saved_model  # type: ignore
    assert saved.name        == payload["name"]
    assert saved.address     == payload["address"]
    assert saved.coordinates == payload["coordinates"]


def test_create_warehouse_validation_error(client):
    # missing required 'name' and 'address'
    resp = client.post("/warehouse/", json={"notes": "oops"})
    assert resp.status_code == 400

    errors = resp.get_json()
    assert isinstance(errors, list)
    missing = {e["loc"][-1] for e in errors}
    assert "name" in missing
    assert "address" in missing

# --- GET ---

def test_get_warehouse_not_found(client):
    resp = client.get(f"/warehouse/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Warehouse not found"}


def test_get_warehouse_success(client, return_dicts):
    return_single, _ = return_dicts

    wh = WarehouseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="Backup Storage",
        address="200 Backup Rd",
        coordinates=None,
        notes="Secondary site",
        created_at=datetime(2025,4,1,12,0,0),
    )
    # ensure is_deleted present
    setattr(wh, "is_deleted", False)
    return_single["warehouse"] = wh

    resp = client.get(f"/warehouse/{wh.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["uuid"]        == wh.uuid
    assert data["name"]        == wh.name
    assert data["address"]     == wh.address
    assert data["notes"]       == wh.notes
    assert data["created_at"]  == "2025-04-01T12:00:00"
    assert data["is_deleted"] is False

# --- UPDATE ---

def test_update_warehouse_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    wh = WarehouseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="Old Name",
        address="Old Address",
        coordinates=None,
        notes=None,
        created_at=datetime.utcnow(),
    )
    setattr(wh, "is_deleted", False)
    return_single["warehouse"] = wh

    update_payload = {"name": "New Name", "notes": "Updated note"}
    resp = client.put(f"/warehouse/{wh.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["name"]       == "New Name"
    assert data["notes"]      == "Updated note"
    assert data["is_deleted"] is False

    uow = dummy_uow_class.last_instance
    saved: WarehouseModel = uow.warehouse_repository.saved_model  # type: ignore
    assert saved.name  == "New Name"
    assert saved.notes == "Updated note"


def test_update_warehouse_not_found(client):
    resp = client.put(f"/warehouse/{uuid.uuid4()}", json={"name": "X"})
    assert resp.status_code == 404

# --- DELETE (soft) ---

def test_delete_warehouse_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    wh = WarehouseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="ToDelete",
        address="Nowhere",
        coordinates=None,
        notes=None,
        created_at=datetime.utcnow(),
    )
    setattr(wh, "is_deleted", False)
    return_single["warehouse"] = wh

    resp = client.delete(f"/warehouse/{wh.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: WarehouseModel = uow.warehouse_repository.saved_model  # type: ignore
    assert saved.is_deleted is True

# --- LIST (paginated) ---

def test_list_warehouses_default_pagination(client, return_dicts):
    _, return_all = return_dicts

    w1 = WarehouseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="W1",
        address="Addr1",
        coordinates=None,
        notes=None,
        created_at=datetime.utcnow(),
    )
    setattr(w1, "is_deleted", False)
    w2 = WarehouseModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        name="W2",
        address="Addr2",
        coordinates=None,
        notes=None,
        created_at=datetime.utcnow(),
    )
    setattr(w2, "is_deleted", False)
    return_all["warehouse"] = [w1, w2]

    resp = client.get("/warehouse/")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 2
    assert data["page"]        == 1
    assert data["per_page"]    == 20
    assert data["pages"]       == 1
    names = {wht["name"] for wht in data["warehouses"]}
    assert names == {"W1", "W2"}
    for wht in data["warehouses"]:
        assert wht["is_deleted"] is False


def test_list_warehouses_multi_page(client, return_dicts):
    _, return_all = return_dicts
    all_wh = []
    for i in range(25):
        w = WarehouseModel(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            name=f"Name{i}",
            address=f"Addr{i}",
            coordinates=None,
            notes=None,
            created_at=datetime.utcnow(),
        )
        setattr(w, "is_deleted", False)
        all_wh.append(w)
    return_all["warehouse"] = all_wh

    resp = client.get("/warehouse/?page=2&per_page=20")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"]        == 2
    assert data["per_page"]    == 20
    assert data["pages"]       == 2
    returned = {wht["uuid"] for wht in data["warehouses"]}
    expected = {w.uuid for w in all_wh[20:]}
    assert returned == expected