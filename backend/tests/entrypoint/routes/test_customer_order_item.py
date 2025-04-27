import uuid
from datetime import datetime
import pytest

from models.common import CustomerOrderItem as CustomerOrderItemModel
from app.dto.customer_order_item import (
    CustomerOrderItemBulkCreate,
    CustomerOrderItemBulkRead,
    CustomerOrderItemRead,
    CustomerOrderItemBulkFulfill,
    CustomerOrderItemBulkDelete,
)
from app.domains.customer_order_item.domain import CustomerOrderItemDomain
from app.entrypoint.routes.common.errors import NotFoundError

# --- BULK CREATE ---

def test_bulk_create_order_items_success(client, monkeypatch):
    # Prepare fake DTOs returned by domain
    now = datetime.utcnow()
    fake_items = [
        CustomerOrderItemRead(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            customer_order_uuid=str(uuid.uuid4()),
            quantity=3,
            unit="kg",
            material_uuid=str(uuid.uuid4()),
            is_fulfilled=False,
            is_deleted=False,
            fulfilled_at=None,
            created_at=now
        ),
        CustomerOrderItemRead(
            uuid=str(uuid.uuid4()),
            created_by_uuid=None,
            customer_order_uuid=str(uuid.uuid4()),
            quantity=5,
            unit="ltr",
            material_uuid=str(uuid.uuid4()),
            is_fulfilled=False,
            is_deleted=False,
            fulfilled_at=None,
            created_at=now
        ),
    ]
    fake_bulk_read = CustomerOrderItemBulkRead(items=fake_items)
    monkeypatch.setattr(
        CustomerOrderItemDomain,
        'create_items',
        lambda uow, payload: fake_bulk_read
    )

    payload = {
        "items": [
            {"customer_order_uuid": i.customer_order_uuid, "quantity": i.quantity, "material_uuid": i.material_uuid}
            for i in fake_items
        ]
    }
    resp = client.post('/customer_order_item/bulk-create', json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert "items" in data
    assert len(data["items"]) == 2
    returned_uuids = {it["uuid"] for it in data["items"]}
    expected_uuids = {i.uuid for i in fake_items}
    assert returned_uuids == expected_uuids

# --- GET SINGLE ---

def test_get_order_item_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError) as excinfo:
        client.get(f'/customer_order_item/{random_uuid}')
    assert str(excinfo.value) == 'CustomerOrderItem not found'


def test_get_order_item_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    # Create a real model and stub from_orm
    item = CustomerOrderItemModel(
        uuid=str(uuid.uuid4()),
        customer_order_uuid=str(uuid.uuid4()),
        quantity=7,
        unit="pcs",
        material_uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        is_fulfilled=False,
        fulfilled_at=None,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single['customer_order_item'] = item
    now = datetime.utcnow()
    fake_dto = CustomerOrderItemRead(
        uuid=item.uuid,
        created_by_uuid=None,
        customer_order_uuid=item.customer_order_uuid,
        quantity=item.quantity,
        unit=item.unit,
        material_uuid=item.material_uuid,
        is_fulfilled=False,
        is_deleted=False,
        fulfilled_at=None,
        created_at=now
    )
    monkeypatch.setattr(
        CustomerOrderItemRead,
        'from_orm',
        classmethod(lambda cls, obj: fake_dto)
    )
    resp = client.get(f'/customer_order_item/{item.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == fake_dto.model_dump(mode='json')

# --- LIST ---

def test_list_order_items_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    # Prepare two items
    item1 = CustomerOrderItemModel(
        uuid=str(uuid.uuid4()),
        customer_order_uuid="CO1",
        quantity=1,
        unit="kg",
        material_uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        is_fulfilled=False,
        fulfilled_at=None,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    item2 = CustomerOrderItemModel(
        uuid=str(uuid.uuid4()),
        customer_order_uuid="CO2",
        quantity=2,
        unit="ltr",
        material_uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        is_fulfilled=False,
        fulfilled_at=None,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all['customer_order_item'] = [item1, item2]
    now = datetime.utcnow()
    fake_dto1 = CustomerOrderItemRead(
        uuid=item1.uuid,
        created_by_uuid=None,
        customer_order_uuid=item1.customer_order_uuid,
        quantity=item1.quantity,
        unit=item1.unit,
        material_uuid=item1.material_uuid,
        is_fulfilled=False,
        is_deleted=False,
        fulfilled_at=None,
        created_at=now
    )
    fake_dto2 = CustomerOrderItemRead(
        uuid=item2.uuid,
        created_by_uuid=None,
        customer_order_uuid=item2.customer_order_uuid,
        quantity=item2.quantity,
        unit=item2.unit,
        material_uuid=item2.material_uuid,
        is_fulfilled=False,
        is_deleted=False,
        fulfilled_at=None,
        created_at=now
    )
    # Stub from_orm
    monkeypatch.setattr(
        CustomerOrderItemRead,
        'from_orm',
        classmethod(lambda cls, obj: fake_dto1 if obj is item1 else fake_dto2)
    )
    resp = client.get('/customer_order_item/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    uuids = {it['uuid'] for it in data['items']}
    assert uuids == {item1.uuid, item2.uuid}

# --- FULFILL BULK ---

def test_fulfill_order_items_success(client, monkeypatch):
    uuids = [str(uuid.uuid4()), str(uuid.uuid4())]
    now = datetime.utcnow()
    fake_items = []
    for u in uuids:
        fake_items.append(
            CustomerOrderItemRead(
                uuid=u,
                created_by_uuid=None,
                customer_order_uuid=str(uuid.uuid4()),
                quantity=4,
                unit="kg",
                material_uuid=str(uuid.uuid4()),
                is_fulfilled=True,
                is_deleted=False,
                fulfilled_at=now,
                created_at=now
            )
        )
    fake_bulk = CustomerOrderItemBulkRead(items=fake_items)
    monkeypatch.setattr(
        CustomerOrderItemDomain,
        'fulfill_items',
        lambda uow, payload: fake_bulk
    )
    payload = {"uuids": uuids}
    resp = client.post('/customer_order_item/fulfill-items', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    returned = {it['uuid'] for it in data['items']}
    assert returned == set(uuids)

# --- DELETE BULK ---

def test_delete_order_items_success(client, monkeypatch):
    uuids = [str(uuid.uuid4())]
    now = datetime.utcnow()
    fake_items = [
        CustomerOrderItemRead(
            uuid=uuids[0],
            created_by_uuid=None,
            customer_order_uuid=str(uuid.uuid4()),
            quantity=6,
            unit="ltr",
            material_uuid=str(uuid.uuid4()),
            is_fulfilled=False,
            is_deleted=True,
            fulfilled_at=None,
            created_at=now
        )
    ]
    fake_bulk = CustomerOrderItemBulkRead(items=fake_items)
    monkeypatch.setattr(
        CustomerOrderItemDomain,
        'delete_items',
        lambda uow, payload: fake_bulk
    )
    payload = {"uuids": uuids}
    resp = client.delete('/customer_order_item/bulk-delete', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['items'][0]['uuid'] == uuids[0]
