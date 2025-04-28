import uuid
from datetime import datetime
import pytest
from pydantic_core import ValidationError as PydanticValidationError
from app.dto.inventory import (
    InventoryRead,
)
from app.domains.inventory.domain import InventoryDomain
from app.dto.common_enums import UnitOfMeasure, Currency
from models.common import Inventory as InventoryModel
from _pytest import monkeypatch

from app.entrypoint.routes.common.errors import NotFoundError


# --- CREATE ---

def test_create_inventory_success(client, monkeypatch):
    now = datetime.utcnow()
    # prepare a read DTO
    read_dto = InventoryRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-123",
        material_uuid="mat-456",
        warehouse_uuid="wh-789",
        notes="Received lot",
        lot_id="LOT-001",
        expiration_date=now,
        cost_per_unit=10.0,
        unit=UnitOfMeasure.KG,
        current_quantity=100.0,
        original_quantity=100.0,
        is_active=True,
        currency=Currency.USD,
        created_at=now,
        is_deleted=False,
        total_original_cost=100.0 * 10.0
    )
    monkeypatch.setattr(
        InventoryDomain,
        'create_inventory',
        lambda uow, payload: read_dto
    )
    payload = {
        "material_uuid": read_dto.material_uuid,
        "warehouse_uuid": read_dto.warehouse_uuid,
        "notes": read_dto.notes,
        "lot_id": read_dto.lot_id,
        "expiration_date": now.isoformat(),
        "cost_per_unit": read_dto.cost_per_unit,
        "unit": read_dto.unit.value,
        "current_quantity": read_dto.current_quantity,
        "original_quantity": read_dto.original_quantity,
        "is_active": read_dto.is_active,
        "currency": read_dto.currency.value
    }
    resp = client.post('/inventory/', json=payload)
    assert resp.status_code == 201
    assert resp.get_json() == read_dto.model_dump(mode='json')


def test_create_inventory_validation_error(client):
    with pytest.raises(PydanticValidationError) as excinfo:
        # missing required material_uuid and unit etc.
        resp = client.post('/inventory/', json={})
        assert resp.status_code == 422
        err = resp.get_json()
        assert err['error'] == 'Validation error'
        keys = {e['loc'][-1] for e in err['details']}
        assert 'material_uuid' in keys
        assert 'unit' in keys
        assert 'current_quantity' in keys
        assert 'original_quantity' in keys
        assert 'currency' in keys

# --- GET ---

def test_get_inventory_not_found(client):
    with pytest.raises(NotFoundError):
        random_uuid = str(uuid.uuid4())
        resp = client.get(f'/inventory/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Inventory not found'}


def test_get_inventory_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    model = InventoryModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid="matX",
        warehouse_uuid=None,
        notes=None,
        lot_id="LOTX",
        expiration_date=None,
        cost_per_unit=5.0,
        unit="kg",
        current_quantity=10.0,
        original_quantity=10.0,
        is_active=True,
        currency="USD",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single['inventory'] = model
    now = datetime.utcnow()
    read_dto = InventoryRead(
        uuid=model.uuid,
        created_by_uuid=None,
        material_uuid=model.material_uuid,
        warehouse_uuid=model.warehouse_uuid,
        notes=None,
        lot_id=model.lot_id,
        expiration_date=None,
        cost_per_unit=model.cost_per_unit,
        unit=UnitOfMeasure.KG,
        current_quantity=model.current_quantity,
        original_quantity=model.original_quantity,
        is_active=True,
        currency=Currency.USD,
        created_at=now,
        is_deleted=False,
        total_original_cost=10.0 * 5.0
    )
    monkeypatch.setattr(
        InventoryRead,
        'from_orm',
        classmethod(lambda cls, obj: read_dto)
    )
    resp = client.get(f'/inventory/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')

# --- UPDATE ---

def test_update_inventory_not_found(client):
    with pytest.raises(NotFoundError):
        random_uuid = str(uuid.uuid4())
        resp = client.put(f'/inventory/{random_uuid}', json={'notes': 'upd'})
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Inventory not found'}


def test_update_inventory_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    model = InventoryModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid="matY",
        warehouse_uuid=None,
        notes="old",
        lot_id="LOTY",
        expiration_date=None,
        cost_per_unit=2.0,
        unit="kg",
        current_quantity=20.0,
        original_quantity=20.0,
        is_active=True,
        currency="USD",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single['inventory'] = model
    resp = client.put(f'/inventory/{model.uuid}', json={'notes': 'new notes'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['notes'] == 'new notes'
    uow = dummy_uow_class.last_instance
    saved: InventoryModel = uow.inventory_repository.saved_model
    assert saved.notes == 'new notes'

# --- DELETE ---

def test_delete_inventory_not_found(client):
    with pytest.raises(NotFoundError):
        random_uuid = str(uuid.uuid4())
        resp = client.delete(f'/inventory/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Inventory not found'}


def test_delete_inventory_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = InventoryRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid="matZ",
        warehouse_uuid=None,
        notes=None,
        lot_id="LOTZ",
        expiration_date=None,
        cost_per_unit=3.0,
        unit=UnitOfMeasure.KG,
        current_quantity=30.0,
        original_quantity=30.0,
        is_active=True,
        currency=Currency.USD,
        created_at=now,
        is_deleted=True,
        total_original_cost=30.0 * 3.0
    )
    monkeypatch.setattr(
        InventoryDomain,
        'delete_inventory',
        lambda uow, uuid: read_dto
    )
    resp = client.delete(f'/inventory/{read_dto.uuid}')
    assert resp.status_code == 200
    assert resp.get_json()['is_deleted'] is True

# --- LIST ---

def test_list_inventories_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m1 = InventoryModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid="m1",
        warehouse_uuid="w1",
        notes=None,
        lot_id="L1",
        expiration_date=None,
        cost_per_unit=1.0,
        unit="kg",
        current_quantity=5.0,
        original_quantity=5.0,
        is_active=True,
        currency="USD",
        created_at=datetime(2025,1,1),
        is_deleted=False
    )
    m2 = InventoryModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid="m2",
        warehouse_uuid="w2",
        notes=None,
        lot_id="L2",
        expiration_date=None,
        cost_per_unit=2.0,
        unit="kg",
        current_quantity=10.0,
        original_quantity=10.0,
        is_active=False,
        currency="USD",
        created_at=datetime(2025,2,1),
        is_deleted=False
    )
    return_all['inventory'] = [m1, m2]
    dto1 = InventoryRead.from_orm = classmethod(lambda cls,obj: InventoryRead(
        uuid=obj.uuid,
        created_by_uuid=None,
        material_uuid=obj.material_uuid,
        warehouse_uuid=obj.warehouse_uuid,
        notes=None,
        lot_id=obj.lot_id,
        expiration_date=None,
        cost_per_unit=obj.cost_per_unit,
        unit=UnitOfMeasure.KG,
        current_quantity=obj.current_quantity,
        original_quantity=obj.original_quantity,
        is_active=obj.is_active,
        currency=Currency.USD,
        created_at=datetime.utcnow(),
        is_deleted=False,
        total_original_cost=obj.original_quantity*obj.cost_per_unit
    ))
    resp = client.get('/inventory/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    ids = {inv['uuid'] for inv in data['inventories']}
    assert ids == {m1.uuid, m2.uuid}


def test_list_inventories_filter_params(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = InventoryModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        material_uuid="FILTER_M",
        warehouse_uuid="FW",
        notes=None,
        lot_id="LF",
        expiration_date=None,
        cost_per_unit=4.0,
        unit="kg",
        current_quantity=8.0,
        original_quantity=8.0,
        is_active=True,
        currency="USD",
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all['inventory'] = [m]
    read_dto = InventoryRead(
        uuid=m.uuid,
        created_by_uuid=None,
        material_uuid=m.material_uuid,
        warehouse_uuid=m.warehouse_uuid,
        notes=None,
        lot_id=m.lot_id,
        expiration_date=None,
        cost_per_unit=m.cost_per_unit,
        unit=UnitOfMeasure.KG,
        current_quantity=m.current_quantity,
        original_quantity=m.original_quantity,
        is_active=True,
        currency=Currency.USD,
        created_at=datetime.utcnow(),
        is_deleted=False,
        total_original_cost=8.0*4.0
    )
    monkeypatch.setattr(
        InventoryRead,
        'from_orm',
        classmethod(lambda cls,obj: read_dto)
    )
    params = f'?material_uuid={m.material_uuid}&warehouse_uuid={m.warehouse_uuid}&is_active=1&currency=USD'
    resp = client.get(f'/inventory/{params}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    inv = data['inventories'][0]
    assert inv['material_uuid'] == m.material_uuid
    assert inv['warehouse_uuid'] == m.warehouse_uuid
    assert inv['is_active'] is True
    assert inv['currency'] == 'USD'
