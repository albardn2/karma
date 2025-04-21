import uuid
from datetime import datetime, timedelta
import pytest
from types import SimpleNamespace

from models.common import PurchaseOrder as PurchaseOrderModel
from app.dto.common_enums import Currency
from app.dto.purchase_order import PurchaseOrderStatus

from models.common import PurchaseOrderItem, Payout


# --- CREATE ---

def test_create_order_success(client, dummy_uow_class):
    payload = {
        "created_by_uuid":  str(uuid.uuid4()),
        "vendor_uuid":      str(uuid.uuid4()),
        "currency":         Currency.USD.value,
        "status":           PurchaseOrderStatus.PENDING.value,
        "notes":            "First order",
        "payout_due_date":  None
    }
    resp = client.post("/purchase_order/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # echo back
    assert data["vendor_uuid"]     == payload["vendor_uuid"]
    assert data["currency"]        == payload["currency"]
    assert data["status"]          == payload["status"]
    assert data["notes"]           == payload["notes"]
    assert "payout_due_date" in data
    # defaults & computed
    assert isinstance(data["uuid"], str)
    datetime.fromisoformat(data["created_at"])
    assert data["is_deleted"] is False
    # computed fields should be present (items/payouts empty -> zeros/False)
    assert data["total_amount"] == 0
    assert data["amount_paid"]  == 0
    assert data["amount_due"]   == 0
    assert data["is_paid"] is True   # zero due means paid
    assert data["is_overdue"] is None
    assert data["is_fulfilled"] is True
    assert data["fulfilled_at"] is None

    # verify save saw correct model
    uow = dummy_uow_class.last_instance
    saved: PurchaseOrderModel = uow.purchase_order_repository.saved_model
    assert saved.vendor_uuid == payload["vendor_uuid"]
    assert saved.status      == payload["status"]


def test_create_order_validation_error(client):
    # missing required: vendor_uuid, currency, status
    resp = client.post("/purchase_order/", json={"notes": "oops"})
    assert resp.status_code == 400
    errors = resp.get_json()
    missing = {e["loc"][-1] for e in errors}
    assert "vendor_uuid" in missing
    assert "currency" in missing
    assert "status" in missing

#
# # --- GET ---
#
def test_get_order_not_found(client):
    resp = client.get(f"/purchase_order/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "PurchaseOrder not found"}


def test_get_order_success(client, return_dicts):
    return_single, _ = return_dicts

    # Build a PO with items and payouts to exercise computed fields
    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid=str(uuid.uuid4()),
        currency=Currency.USD.value,
        status=PurchaseOrderStatus.PENDING.value,
        created_at=datetime.utcnow(),
        is_deleted=False,
        notes="Test",
        payout_due_date=datetime.utcnow() - timedelta(days=1)  # past -> overdue
    )
    # 2) Attach real PurchaseOrderItemModel instances
    item1 = PurchaseOrderItem(
        price_per_unit=10.0,
        quantity=2,
        is_fulfilled=True,
        fulfilled_at=datetime(2025, 1, 1),
    )
    item2 = PurchaseOrderItem(
        price_per_unit=5.0,
        quantity=1,
        is_fulfilled=True,
        fulfilled_at=datetime(2025, 1, 2),
    )
    po.purchase_order_items = [item1, item2]

    # 3) Attach real PurchaseOrderPayoutModel instances
    payout = Payout(amount=15.0)
    po.payouts = [payout]
    return_single["purchase_order"] = po

    resp = client.get(f"/purchase_order/{po.uuid}")
    assert resp.status_code == 200
    data = resp.get_json()

    # computed checks
    assert data["total_amount"] == 10.0*2 + 5.0*1
    assert data["amount_paid"]  == 15.0
    assert data["amount_due"]   == (10.0*2 + 5.0*1) - 15.0
    assert data["is_paid"] is False
    assert data["is_overdue"] is True
    assert data["is_fulfilled"] is True
    # fulfilled_at = max(fulfilled_at)
    assert data["fulfilled_at"] == "2025-01-02T00:00:00"


# --- UPDATE ---

def test_update_order_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid=str(uuid.uuid4()),
        currency=Currency.SYP.value,
        status=PurchaseOrderStatus.DRAFT.value,
        created_at=datetime.utcnow(),
        is_deleted=False,
    )
    po.purchase_order_items = []
    po.payouts = []
    return_single["purchase_order"] = po

    update_payload = {"status": PurchaseOrderStatus.PAID.value, "notes": "Done"}
    resp = client.put(f"/purchase_order/{po.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["status"] == update_payload["status"]
    assert data["notes"]  == update_payload["notes"]

    uow = dummy_uow_class.last_instance
    saved: PurchaseOrderModel = uow.purchase_order_repository.saved_model
    assert saved.status == update_payload["status"]
    assert saved.notes  == update_payload["notes"]


def test_update_order_not_found(client):
    resp = client.put(f"/purchase_order/{uuid.uuid4()}", json={"status": PurchaseOrderStatus.VOID.value})
    assert resp.status_code == 404


# --- DELETE (soft) ---

def test_delete_order_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid=str(uuid.uuid4()),
        currency=Currency.USD.value,
        status=PurchaseOrderStatus.PENDING.value,
        created_at=datetime.utcnow(),
        is_deleted=False,
    )
    po.purchase_order_items = []
    po.payouts = []
    return_single["purchase_order"] = po

    resp = client.delete(f"/purchase_order/{po.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: PurchaseOrderModel = uow.purchase_order_repository.saved_model
    assert saved.is_deleted is True


# --- LIST (filters + pagination) ---

def test_list_orders_default_pagination(client, return_dicts):
    _, return_all = return_dicts

    po1 = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid="V1",
        currency=Currency.USD.value,
        status=PurchaseOrderStatus.PENDING.value,
        created_at=datetime(2025,1,1),
        is_deleted=False
    )
    po1.purchase_order_items = []; po1.payouts = []

    po2 = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid="V2",
        currency=Currency.SYP.value,
        status=PurchaseOrderStatus.DRAFT.value,
        created_at=datetime(2025,2,1),
        is_deleted=False
    )
    po2.purchase_order_items = []; po2.payouts = []

    return_all["purchase_order"] = [po1, po2]

    resp = client.get("/purchase_order/")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["total_count"] == 2
    assert data["page"]        == 1
    assert data["per_page"]    == 20
    assert data["pages"]       == 1
    ids = {o["uuid"] for o in data["purchase_orders"]}
    assert ids == {po1.uuid, po2.uuid}


def test_list_orders_filter_vendor_and_status(client, return_dicts):
    _, return_all = return_dicts

    po = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid="FILTER_ME",
        currency=Currency.USD.value,
        status=PurchaseOrderStatus.PENDING.value,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    po.purchase_order_items = []; po.payouts = []

    return_all["purchase_order"] = [po]

    resp = client.get(f"/purchase_order/?vendor_uuid={po.vendor_uuid}&status={po.status}")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["total_count"] == 1
    assert data["purchase_orders"][0]["vendor_uuid"] == po.vendor_uuid
    assert data["purchase_orders"][0]["status"]     == po.status


def test_list_orders_filter_date_range(client, return_dicts):
    _, return_all = return_dicts

    base = datetime(2025,3,15,12,0,0)
    po1 = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid="X",
        currency=Currency.USD.value,
        status=PurchaseOrderStatus.PENDING.value,
        created_at=base - timedelta(days=5),
        is_deleted=False
    )
    po2 = PurchaseOrderModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        vendor_uuid="X",
        currency=Currency.USD.value,
        status=PurchaseOrderStatus.PENDING.value,
        created_at=base + timedelta(days=5),
        is_deleted=False
    )
    po1.purchase_order_items = []; po1.payouts = []
    po2.purchase_order_items = []; po2.payouts = []

    # simulate repo returning both, but our filters should cut out po1
    return_all["purchase_order"] = [po2]

    start = (base - timedelta(days=1)).isoformat()
    end   = (base + timedelta(days=1)).isoformat()

    resp = client.get(f"/purchase_order/?start_date={start}&end_date={end}")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["total_count"] == 1
    assert data["purchase_orders"][0]["uuid"] == po2.uuid


def test_list_orders_multi_page(client, return_dicts):
    _, return_all = return_dicts

    all_pos = []
    for i in range(25):
        po = PurchaseOrderModel(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            vendor_uuid="X",
            currency=Currency.USD.value,
            status=PurchaseOrderStatus.PENDING.value,
            created_at=datetime.utcnow(),
            is_deleted=False
        )
        po.purchase_order_items = []; po.payouts = []
        all_pos.append(po)

    return_all["purchase_order"] = all_pos

    resp = client.get("/purchase_order/?page=2&per_page=20")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["total_count"] == 25
    assert data["page"]        == 2
    assert data["per_page"]    == 20
    assert data["pages"]       == 2
    assert len(data["purchase_orders"]) == 5
    expected = {o.uuid for o in all_pos[20:]}
    returned = {o["uuid"] for o in data["purchase_orders"]}
    assert returned == expected
