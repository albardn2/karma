import uuid
from datetime import datetime, timedelta
import pytest
from app.dto.inventory_event import (
    InventoryEventRead,
    InventoryEventType,
)
from app.domains.inventory_event.domain import InventoryEventDomain
from models.common import InventoryEvent as InventoryEventModel
from pydantic import ValidationError

from app.entrypoint.routes.common.errors import NotFoundError


# --- CREATE ---

def test_create_inventory_event_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = InventoryEventRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-1",
        inventory_uuid="inv-123",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type=InventoryEventType.PROCUREMENT,
        quantity=100.0,
        notes="Received stock",
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-456",
        created_at=now,
        is_deleted=False
    )
    # stub the domain method
    monkeypatch.setattr(
        InventoryEventDomain,
        'create_inventory_event',
        lambda uow, payload: read_dto
    )
    payload = {
        "inventory_uuid": read_dto.inventory_uuid,
        "event_type": read_dto.event_type.value,
        "quantity": read_dto.quantity,
        "notes": read_dto.notes
    }
    resp = client.post('/inventory_event/', json=payload)
    assert resp.status_code == 201
    assert resp.get_json() == read_dto.model_dump(mode='json')


def test_create_inventory_event_validation_error(client):
    # missing required: inventory_uuid, event_type, quantity
    with pytest.raises(ValidationError) as excinfo:
        resp = client.post('/inventory_event/', json={})
        assert resp.status_code == 422
        err = resp.get_json()
        assert err['error'] == 'Validation error'
        missing = {e['loc'][-1] for e in err['details']}
        assert 'inventory_uuid' in missing
        assert 'event_type' in missing
        assert 'quantity' in missing


# --- GET SINGLE ---

def test_get_inventory_event_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.get(f'/inventory_event/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'InventoryEvent not found'}


def test_get_inventory_event_success(client, return_dicts,dummy_uow_class, monkeypatch):
    return_single, _ = return_dicts
    # prepare a real model instance
    model = InventoryEventModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        inventory_uuid="inv-789",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type="sale",
        quantity=5.0,
        notes="Sold items",
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-123",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single['inventory_event'] = model

    now = datetime.utcnow()
    read_dto = InventoryEventRead(
        uuid=model.uuid,
        created_by_uuid=None,
        inventory_uuid=model.inventory_uuid,
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type=InventoryEventType.SALE,
        quantity=model.quantity,
        notes=model.notes,
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid=model.material_uuid,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        InventoryEventRead,
        'from_orm',
        classmethod(lambda cls, obj: read_dto)
    )

    resp = client.get(f'/inventory_event/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')


# --- UPDATE ---

def test_update_inventory_event_not_found(client):
    with pytest.raises(NotFoundError):
        random_uuid = str(uuid.uuid4())
        resp = client.put(f'/inventory_event/{random_uuid}', json={'notes': 'adjusted'})
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'InventoryEvent not found'}


def test_update_inventory_event_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    model = InventoryEventModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        inventory_uuid="inv-456",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type="transfer",
        quantity=20.0,
        notes="before update",
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-789",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single['inventory_event'] = model

    resp = client.put(f'/inventory_event/{model.uuid}', json={'notes': 'after update'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['notes'] == 'after update'

    # verify the UoW actually saved the change
    uow = dummy_uow_class.last_instance
    saved: InventoryEventModel = uow.inventory_event_repository.saved_model
    assert saved.notes == 'after update'


# --- DELETE ---

def test_delete_inventory_event_not_found(client):
    with pytest.raises(NotFoundError):
        random_uuid = str(uuid.uuid4())
        resp = client.delete(f'/inventory_event/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'InventoryEvent not found'}


def test_delete_inventory_event_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = InventoryEventRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        inventory_uuid="inv-000",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type=InventoryEventType.SALE,
        quantity=1.0,
        notes=None,
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-000",
        created_at=now,
        is_deleted=True
    )
    monkeypatch.setattr(
        InventoryEventDomain,
        'delete_inventory_event',
        lambda uow, uuid: read_dto
    )
    resp = client.delete(f'/inventory_event/{read_dto.uuid}')
    assert resp.status_code == 200
    assert resp.get_json()['is_deleted'] is True


# --- LIST ---

def test_list_inventory_events_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts

    m1 = InventoryEventModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        inventory_uuid="inv-A",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type="return",
        quantity=2.0,
        notes="r1",
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-A",
        created_at=datetime(2025,1,1),
        is_deleted=False
    )
    m2 = InventoryEventModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        inventory_uuid="inv-B",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type="scrap",
        quantity=3.0,
        notes="r2",
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-B",
        created_at=datetime(2025,2,1),
        is_deleted=False
    )
    return_all['inventory_event'] = [m1, m2]

    dto1 = InventoryEventRead(
        uuid=m1.uuid,
        created_by_uuid=None,
        inventory_uuid=m1.inventory_uuid,
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type=InventoryEventType.RETURN,
        quantity=m1.quantity,
        notes=m1.notes,
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid=m1.material_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    dto2 = InventoryEventRead(
        uuid=m2.uuid,
        created_by_uuid=None,
        inventory_uuid=m2.inventory_uuid,
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type=InventoryEventType.SCRAP,
        quantity=m2.quantity,
        notes=m2.notes,
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid=m2.material_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    monkeypatch.setattr(
        InventoryEventRead,
        'from_orm',
        classmethod(lambda cls, obj: dto1 if obj is m1 else dto2)
    )

    resp = client.get('/inventory_event/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    returned_uuids = {e['uuid'] for e in data['events']}
    assert returned_uuids == {m1.uuid, m2.uuid}


def test_list_inventory_events_filter_event_type(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = InventoryEventModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        inventory_uuid="inv-X",
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type="transfer",
        quantity=7.0,
        notes="t1",
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid="mat-X",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all['inventory_event'] = [m]

    dto = InventoryEventRead(
        uuid=m.uuid,
        created_by_uuid=None,
        inventory_uuid=m.inventory_uuid,
        purchase_order_item_uuid=None,
        process_uuid=None,
        customer_order_item_uuid=None,
        event_type=InventoryEventType.TRANSFER,
        quantity=m.quantity,
        notes=m.notes,
        debit_note_item_uuid=None,
        credit_note_item_uuid=None,
        material_uuid=m.material_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    monkeypatch.setattr(
        InventoryEventRead,
        'from_orm',
        classmethod(lambda cls, obj: dto)
    )

    resp = client.get(f'/inventory_event/?event_type={dto.event_type.value}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    assert data['events'][0]['event_type'] == dto.event_type.value
