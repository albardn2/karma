import uuid
from datetime import datetime
import pytest

from models.common import CustomerOrder as CustomerOrderModel
from app.dto.customer_order import (
    CustomerOrderCreate,
    CustomerOrderRead,
    CustomerOrderUpdate,
    CustomerOrderListParams,
    CustomerOrderPage,
)
from app.domains.customer_order.domain import CustomerOrderDomain
from app.entrypoint.routes.common.errors import NotFoundError

# --- CREATE ---

def test_create_customer_order_success(client, monkeypatch):
    # Mock domain to return a CustomerOrderRead DTO
    fake_uuid = str(uuid.uuid4())
    created_at = datetime.utcnow()
    fake_dto = CustomerOrderRead(
        uuid=fake_uuid,
        created_by_uuid=str(uuid.uuid4()),
        customer_uuid=str(uuid.uuid4()),
        notes="Test order",
        created_at=created_at,
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=False,
    )
    monkeypatch.setattr(
        CustomerOrderDomain,
        'create_customer_order',
        lambda uow, payload: fake_dto
    )

    payload = {
        'created_by_uuid': fake_dto.created_by_uuid,
        'customer_uuid': fake_dto.customer_uuid,
        'notes': fake_dto.notes
    }
    resp = client.post('/customer_order/', json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data == fake_dto.model_dump(mode='json')


def test_create_customer_order_validation_error(client):
    # missing required: customer_uuid
    with pytest.raises(Exception):
        client.post('/customer_order/', json={'notes': 'oops'})

# --- GET ---

def test_get_customer_order_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        client.get(f"/customer_order/{uuid.uuid4()}")
    assert str(excinfo.value) == 'CustomerOrder not found'


def test_get_customer_order_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    # Mock from_orm to return DTO
    fake_uuid = str(uuid.uuid4())
    created_at = datetime(2025,1,1,12,0,0)
    order = CustomerOrderModel(uuid=fake_uuid, created_by_uuid=None, customer_uuid=str(uuid.uuid4()), notes='Hello')
    return_single['customer_order'] = order
    fake_dto = CustomerOrderRead(
        uuid=fake_uuid,
        created_by_uuid=None,
        customer_uuid=order.customer_uuid,
        notes='Hello',
        created_at=created_at,
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=False,
    )
    monkeypatch.setattr(
        CustomerOrderRead,
        'from_orm',
        classmethod(lambda cls, obj: fake_dto)
    )

    resp = client.get(f"/customer_order/{order.uuid}")
    assert resp.status_code == 200
    assert resp.get_json() == fake_dto.model_dump(mode='json')

# --- UPDATE ---

def test_update_customer_order_success(client, monkeypatch):
    fake_uuid = str(uuid.uuid4())
    updated_notes = 'Updated notes'
    # DTO returned from domain
    updated_dto = CustomerOrderRead(
        uuid=fake_uuid,
        created_by_uuid=None,
        customer_uuid=str(uuid.uuid4()),
        notes=updated_notes,
        created_at=datetime.utcnow(),
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=False,
    )
    monkeypatch.setattr(
        CustomerOrderDomain,
        'update_customer_order',
        lambda uuid, uow, payload: updated_dto
    )

    payload = {'notes': updated_notes}
    resp = client.put(f"/customer_order/{fake_uuid}", json=payload)
    assert resp.status_code == 200
    assert resp.get_json() == updated_dto.model_dump(mode='json')

# --- DELETE ---

def test_delete_customer_order_success(client, monkeypatch):
    fake_uuid = str(uuid.uuid4())
    deleted_dto = CustomerOrderRead(
        uuid=fake_uuid,
        created_by_uuid=None,
        customer_uuid=str(uuid.uuid4()),
        notes=None,
        created_at=datetime.utcnow(),
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=True,
    )
    monkeypatch.setattr(
        CustomerOrderDomain,
        'delete_customer_order',
        lambda uuid, uow: deleted_dto
    )

    resp = client.delete(f"/customer_order/{fake_uuid}")
    assert resp.status_code == 200
    assert resp.get_json() == deleted_dto.model_dump(mode='json')

# --- LIST ---

def test_list_customer_orders_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    order1 = CustomerOrderModel(uuid=str(uuid.uuid4()), created_by_uuid=None, customer_uuid='C1', notes='')
    order2 = CustomerOrderModel(uuid=str(uuid.uuid4()), created_by_uuid=None, customer_uuid='C2', notes='')
    return_all['customer_order'] = [order1, order2]

    # Mock from_orm
    fake_dto1 = CustomerOrderRead(
        uuid=order1.uuid,
        created_by_uuid=None,
        customer_uuid=order1.customer_uuid,
        notes='',
        created_at=datetime(2025,3,1,0,0,0),
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=False,
    )
    fake_dto2 = CustomerOrderRead(
        uuid=order2.uuid,
        created_by_uuid=None,
        customer_uuid=order2.customer_uuid,
        notes='',
        created_at=datetime(2025,4,1,0,0,0),
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=False,
    )
    monkeypatch.setattr(
        CustomerOrderRead,
        'from_orm',
        classmethod(lambda cls, obj: fake_dto1 if obj is order1 else fake_dto2)
    )

    resp = client.get('/customer_order/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    assert data['page'] == 1
    assert data['per_page'] == 20
    assert data['pages'] == 1
    uuids = {o['uuid'] for o in data['orders']}
    assert uuids == {order1.uuid, order2.uuid}


def test_list_customer_orders_filter_customer_uuid(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    order = CustomerOrderModel(uuid=str(uuid.uuid4()), created_by_uuid=None, customer_uuid='FILTER_ME', notes='')
    return_all['customer_order'] = [order]

    # Mock from_orm
    fake_dto = CustomerOrderRead(
        uuid=order.uuid,
        created_by_uuid=None,
        customer_uuid=order.customer_uuid,
        notes='',
        created_at=datetime.utcnow(),
        is_fulfilled=False,
        fulfilled_at=None,
        is_deleted=False,
    )
    monkeypatch.setattr(
        CustomerOrderRead,
        'from_orm',
        classmethod(lambda cls, obj: fake_dto)
    )

    resp = client.get(f"/customer_order/?customer_uuid={order.customer_uuid}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    assert data['orders'][0]['customer_uuid'] == order.customer_uuid