import uuid
from datetime import datetime, timedelta
import pytest

from models.common import (
    PurchaseOrderItem as PurchaseOrderItemModel,
    Material as MaterialModel,
    PurchaseOrder as PurchaseOrderModel
)
from app.dto.common_enums import Currency, UnitOfMeasure

# --- CREATE ---

def test_create_item_success(client, dummy_uow_class):
    payload = {
        "purchase_order_uuid": str(uuid.uuid4()),
        "material_uuid":       str(uuid.uuid4()),
        "quantity":            4,
        "price_per_unit":      2.5,
        "currency":            Currency.USD.value,
        "unit":                UnitOfMeasure.KG.value,
        # optional follow defaults
        "created_by_uuid":     None,
        "quantity_received":   0.0,
        "is_fulfilled":        False,
        "fulfilled_at":        None,
    }
    resp = client.post("/purchase_order_item/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # echo fields
    assert data["purchase_order_uuid"] == payload["purchase_order_uuid"]
    assert data["material_uuid"]       == payload["material_uuid"]
    assert data["quantity"]            == payload["quantity"]
    assert data["price_per_unit"]      == payload["price_per_unit"]
    assert data["currency"]            == payload["currency"]
    assert data["unit"]                == payload["unit"]
    # computed
    assert data["total_price"] == payload["quantity"] * payload["price_per_unit"]
    # defaults
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False

    # verify save saw correct model
    uow = dummy_uow_class.last_instance
    saved: PurchaseOrderItemModel = uow.purchase_order_item_repository.saved_model  # type: ignore
    assert saved.purchase_order_uuid == payload["purchase_order_uuid"]
    assert saved.material_uuid       == payload["material_uuid"]
    assert saved.quantity            == payload["quantity"]


def test_create_item_validation_error(client):
    # missing required fields
    resp = client.post("/purchase_order_item/", json={"quantity": 1})
    assert resp.status_code == 400
    errors = resp.get_json()
    missing = {e["loc"][-1] for e in errors}
    assert "purchase_order_uuid" in missing
    assert "material_uuid" in missing
    assert "price_per_unit" in missing
    assert "currency" in missing
    assert "unit" in missing

# --- GET ---

def test_get_item_not_found(client):
    resp = client.get(f"/purchase_order_item/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "PurchaseOrderItem not found"}


def test_get_item_success(client, return_dicts):
    return_single, _ = return_dicts

    # create real models
    material = MaterialModel(
        uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
    )
    material.unit = UnitOfMeasure.KG.value

    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        vendor_uuid=str(uuid.uuid4()),
        currency=Currency.USD.value,
        status="pending"
    )

    item = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid=po.uuid,
        material_uuid=material.uuid,
        quantity=3,
        price_per_unit=5.0,
        currency=Currency.USD.value,
        unit=UnitOfMeasure.LITERS.value,
        created_at=datetime.utcnow(),
        is_fulfilled=True,
        fulfilled_at=datetime.utcnow(),
        quantity_received=3.0,
        is_deleted=False
    )
    item.material = material
    item.purchase_order = po
    return_single["purchase_order_item"] = item

    resp = client.get(f"/purchase_order_item/{item.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["uuid"]                 == item.uuid
    assert data["purchase_order_uuid"] == po.uuid
    assert data["material_uuid"]       == material.uuid
    assert data["quantity"]            == item.quantity
    assert data["currency"]            == item.currency
    assert data["unit"]                == item.unit
    assert data["total_price"]         == item.quantity * item.price_per_unit

# --- UPDATE ---

def test_update_item_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    material = MaterialModel(
        uuid=str(uuid.uuid4()), created_at=datetime.utcnow()
    )
    material.unit = UnitOfMeasure.PCS.value
    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()), created_at=datetime.utcnow(),
        vendor_uuid=str(uuid.uuid4()), currency=Currency.USD.value, status="draft"
    )

    item = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
        material_uuid=material.uuid, quantity=2, price_per_unit=7.5,
        currency=Currency.USD.value, unit=UnitOfMeasure.PCS.value,
        created_at=datetime.utcnow(), is_fulfilled=False,
        quantity_received=0.0, is_deleted=False
    )
    item.material = material
    item.purchase_order = po
    return_single["purchase_order_item"] = item

    update_payload = {"quantity": 5, "price_per_unit": 10.0}
    resp = client.put(f"/purchase_order_item/{item.uuid}", json=update_payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["quantity"] == 5
    assert data["price_per_unit"] == 10.0
    assert data["total_price"] == 5 * 10.0

    uow = dummy_uow_class.last_instance
    saved: PurchaseOrderItemModel = uow.purchase_order_item_repository.saved_model  # type: ignore
    assert saved.quantity == 5
    assert saved.price_per_unit == 10.0


def test_update_item_not_found(client):
    resp = client.put(f"/purchase_order_item/{uuid.uuid4()}", json={"quantity": 1})
    assert resp.status_code == 404

# --- DELETE (soft) ---

def test_delete_item_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    material = MaterialModel(
        uuid=str(uuid.uuid4()), created_at=datetime.utcnow()
    )
    material.unit = UnitOfMeasure.KG.value
    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()), created_at=datetime.utcnow(),
        vendor_uuid=str(uuid.uuid4()), currency=Currency.USD.value, status="pending"
    )

    item = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
        material_uuid=material.uuid, quantity=1, price_per_unit=1.0,
        currency=Currency.USD.value, unit=UnitOfMeasure.KG.value,
        created_at=datetime.utcnow(), is_fulfilled=False,
        quantity_received=0.0, is_deleted=False
    )
    item.material = material
    item.purchase_order = po
    return_single["purchase_order_item"] = item

    resp = client.delete(f"/purchase_order_item/{item.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: PurchaseOrderItemModel = uow.purchase_order_item_repository.saved_model  # type: ignore
    assert saved.is_deleted is True

# --- LIST (paginated) ---

def test_list_items_default_pagination(client, return_dicts):
    _, return_all = return_dicts

    # two items
    materials = []
    pos = []
    for i in range(2):
        mat = MaterialModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
        mat.unit = UnitOfMeasure.KG.value
        po = PurchaseOrderModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow(),
                                vendor_uuid=str(uuid.uuid4()), currency=Currency.USD.value, status="pending")
        item = PurchaseOrderItemModel(
            uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
            material_uuid=mat.uuid, quantity=i+1, price_per_unit=2.0,
            currency=Currency.USD.value, unit=mat.unit,
            created_at=datetime.utcnow(), is_fulfilled=False,
            quantity_received=0.0, is_deleted=False
        )
        item.material = mat
        item.purchase_order = po
        pos.append(item)
    return_all["purchase_order_item"] = pos

    resp = client.get("/purchase_order_item/")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 2
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert data["pages"] == 1
    uuids = {it["uuid"] for it in data["items"]}
    assert uuids == {pos[0].uuid, pos[1].uuid}


def test_list_items_filter_purchase_order_uuid(client, return_dicts):
    _, return_all = return_dicts
    # only one matches filter
    mat = MaterialModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
    mat.unit = UnitOfMeasure.KG.value
    po1 = str(uuid.uuid4())
    po2 = str(uuid.uuid4())
    it1 = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po1,
        material_uuid=mat.uuid, quantity=1, price_per_unit=1.0,
        currency=Currency.USD.value, unit=mat.unit,
        created_at=datetime.utcnow(), is_fulfilled=False,
        quantity_received=0.0, is_deleted=False
    )
    it1.material = mat; it1.purchase_order = PurchaseOrderModel(uuid=po1)
    it2 = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po2,
        material_uuid=mat.uuid, quantity=2, price_per_unit=2.0,
        currency=Currency.USD.value, unit=mat.unit,
        created_at=datetime.utcnow(), is_fulfilled=False,
        quantity_received=0.0, is_deleted=False
    )
    it2.material = mat; it2.purchase_order = PurchaseOrderModel(uuid=po2)
    return_all["purchase_order_item"] = [it1]

    resp = client.get(f"/purchase_order_item/?purchase_order_uuid={po1}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 1
    assert data["items"][0]["purchase_order_uuid"] == po1


def test_list_items_filter_material_uuid(client, return_dicts):
    _, return_all = return_dicts
    mat1 = str(uuid.uuid4())
    mat2 = str(uuid.uuid4())
    po = PurchaseOrderModel(uuid=str(uuid.uuid4()))
    it1 = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
        material_uuid=mat1, quantity=3, price_per_unit=3.0,
        currency=Currency.USD.value, unit=UnitOfMeasure.KG.value,
        created_at=datetime.utcnow(), is_fulfilled=False,
        quantity_received=0.0, is_deleted=False
    )
    it2 = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
        material_uuid=mat2, quantity=4, price_per_unit=4.0,
        currency=Currency.USD.value, unit=UnitOfMeasure.KG.value,
        created_at=datetime.utcnow(), is_fulfilled=False,
        quantity_received=0.0, is_deleted=False
    )
    it1.material = MaterialModel(uuid=mat1); it1.purchase_order = po
    it2.material = MaterialModel(uuid=mat2); it2.purchase_order = po
    return_all["purchase_order_item"] = [it1]

    resp = client.get(f"/purchase_order_item/?material_uuid={mat1}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 1
    assert data["items"][0]["material_uuid"] == mat1


def test_list_items_filter_fulfilled_and_date_range(client, return_dicts):
    _, return_all = return_dicts
    base = datetime(2025,4,1,12,0,0)
    mat = MaterialModel(uuid=str(uuid.uuid4()), created_at=base)
    mat.unit = UnitOfMeasure.LITERS.value
    po = PurchaseOrderModel(uuid=str(uuid.uuid4()), created_at=base)

    it1 = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
        material_uuid=mat.uuid, quantity=1, price_per_unit=1.0,
        currency=Currency.USD.value, unit=mat.unit,
        created_at=base - timedelta(days=5), is_fulfilled=True,
        fulfilled_at=base - timedelta(days=4), quantity_received=1.0,
        is_deleted=False
    )
    it2 = PurchaseOrderItemModel(
        uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
        material_uuid=mat.uuid, quantity=2, price_per_unit=2.0,
        currency=Currency.USD.value, unit=mat.unit,
        created_at=base + timedelta(days=5), is_fulfilled=True,
        fulfilled_at=base + timedelta(days=6), quantity_received=2.0,
        is_deleted=False
    )
    it1.material = mat; it1.purchase_order = po
    it2.material = mat; it2.purchase_order = po
    # repo returns only it2 for these filters
    return_all["purchase_order_item"] = [it2]

    start = (base - timedelta(days=1)).isoformat()
    end   = (base + timedelta(days=1)).isoformat()
    resp = client.get(f"/purchase_order_item/?is_fulfilled=true&start_date={start}&end_date={end}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 1
    assert data["items"][0]["uuid"] == it2.uuid


def test_list_items_multi_page(client, return_dicts):
    _, return_all = return_dicts
    all_items = []
    mat = MaterialModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
    mat.unit = UnitOfMeasure.PCS.value
    po = PurchaseOrderModel(uuid=str(uuid.uuid4()), created_at=datetime.utcnow())
    for i in range(25):
        it = PurchaseOrderItemModel(
            uuid=str(uuid.uuid4()), purchase_order_uuid=po.uuid,
            material_uuid=mat.uuid, quantity=i, price_per_unit=1.0,
            currency=Currency.USD.value, unit=mat.unit,
            created_at=datetime.utcnow(), is_fulfilled=False,
            quantity_received=0.0, is_deleted=False
        )
        it.material = mat; it.purchase_order = po
        all_items.append(it)
    return_all["purchase_order_item"] = all_items

    resp = client.get("/purchase_order_item/?page=2&per_page=20")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total_count"] == 25
    assert data["page"]        == 2
    assert data["per_page"]    == 20
    assert data["pages"]       == 2
    assert len(data["items"]) == 5
    expected = {it.uuid for it in all_items[20:]}
    returned = {i["uuid"] for i in data["items"]}
    assert returned == expected
