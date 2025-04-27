import uuid
from datetime import datetime
import pytest
from pydantic import ValidationError as PydanticValidationError
from app.dto.invoice_item import (
    InvoiceItemRead,
    InvoiceItemBulkRead,
)
from app.domains.invoice_item.domain import InvoiceItemDomain
from app.dto.common_enums import Currency, UnitOfMeasure
from models.common import InvoiceItem as InvoiceItemModel
from app.entrypoint.routes.common.errors import NotFoundError


# --- BULK CREATE ---

def test_bulk_create_invoice_items_success(client, monkeypatch):
    now = datetime.utcnow()
    items = []
    for i in range(2):
        dto = InvoiceItemRead(
            uuid=str(uuid.uuid4()),
            created_by_uuid=str(uuid.uuid4()),
            invoice_uuid=str(uuid.uuid4()),
            customer_order_item_uuid=str(uuid.uuid4()),
            price_per_unit=5.0 + i,
            unit=UnitOfMeasure.KG,
            created_at=now,
            quantity=2.0 + i,
            material_name=f"Item {i}",
            total_price=(5.0 + i) * (2.0 + i),
            currency=Currency.USD,
            is_deleted=False
        )
        items.append(dto)
    bulk_read = InvoiceItemBulkRead(items=items)
    monkeypatch.setattr(
        InvoiceItemDomain,
        'create_items',
        lambda uow, payload: bulk_read
    )
    payload = {"items": [
        {
            "created_by_uuid": dto.created_by_uuid,
            "invoice_uuid": dto.invoice_uuid,
            "customer_order_item_uuid": dto.customer_order_item_uuid,
            "price_per_unit": dto.price_per_unit,
        }
        for dto in items
    ]}
    resp = client.post('/invoice_item/bulk-create', json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    returned_ids = {item['uuid'] for item in data['items']}
    assert returned_ids == {dto.uuid for dto in items}


def test_bulk_create_invoice_items_validation_error(client):
    with pytest.raises(PydanticValidationError) as excinfo:
        resp = client.post('/invoice_item/bulk-create', json={})
        assert resp.status_code == 422
        err = resp.get_json()
        assert err['error'] == 'Validation error'
        missing = {e['loc'][-1] for e in err['details']}
        assert 'items' in missing

# --- GET SINGLE ---

def test_get_invoice_item_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:

        random_uuid = str(uuid.uuid4())
        resp = client.get(f'/invoice_item/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'InvoiceItem not found'}


def test_get_invoice_item_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    model = InvoiceItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="INV123",
        customer_order_item_uuid="COI456",
        price_per_unit=10.0,
        created_at=datetime.utcnow(),
        unit="kg"
    )
    return_single['invoice_item'] = model
    now = datetime.utcnow()
    read_dto = InvoiceItemRead(
        uuid=model.uuid,
        created_by_uuid=None,
        invoice_uuid=model.invoice_uuid,
        customer_order_item_uuid=model.customer_order_item_uuid,
        price_per_unit=model.price_per_unit,
        unit=UnitOfMeasure.KG,
        created_at=now,
        quantity=1.0,
        material_name="TestItem",
        total_price=10.0,
        currency=Currency.USD,
        is_deleted=False
    )
    monkeypatch.setattr(
        InvoiceItemRead,
        'from_orm',
        classmethod(lambda cls, obj: read_dto)
    )
    resp = client.get(f'/invoice_item/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')

# --- LIST ---

def test_list_invoice_items_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m1 = InvoiceItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="INV1",
        customer_order_item_uuid="COI1",
        price_per_unit=1.0,
        created_at=datetime(2025,1,1),
        unit="kg"
    )
    m2 = InvoiceItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="INV2",
        customer_order_item_uuid="COI2",
        price_per_unit=2.0,
        created_at=datetime(2025,2,1),
        unit="kg"
    )
    return_all['invoice_item'] = [m1, m2]
    dto1 = InvoiceItemRead(
        uuid=m1.uuid,
        created_by_uuid=None,
        invoice_uuid=m1.invoice_uuid,
        customer_order_item_uuid=m1.customer_order_item_uuid,
        price_per_unit=1.0,
        unit=UnitOfMeasure.KG,
        created_at=datetime.utcnow(),
        quantity=5.0,
        material_name="Mat1",
        total_price=5.0,
        currency=Currency.USD,
        is_deleted=False
    )
    dto2 = InvoiceItemRead(
        uuid=m2.uuid,
        created_by_uuid=None,
        invoice_uuid=m2.invoice_uuid,
        customer_order_item_uuid=m2.customer_order_item_uuid,
        price_per_unit=2.0,
        unit=UnitOfMeasure.KG,
        created_at=datetime.utcnow(),
        quantity=10.0,
        material_name="Mat2",
        total_price=20.0,
        currency=Currency.USD,
        is_deleted=False
    )
    monkeypatch.setattr(
        InvoiceItemRead,
        'from_orm',
        classmethod(lambda cls, obj: dto1 if obj is m1 else dto2)
    )
    resp = client.get('/invoice_item/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    ids = {it['uuid'] for it in data['items']}
    assert ids == {m1.uuid, m2.uuid}


def test_list_invoice_items_filter_invoice_uuid(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = InvoiceItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="FILTER_ME",
        customer_order_item_uuid="COI",
        price_per_unit=3.0,
        created_at=datetime.utcnow(),
        unit="kg"
    )
    return_all['invoice_item'] = [m]
    dto = InvoiceItemRead(
        uuid=m.uuid,
        created_by_uuid=None,
        invoice_uuid=m.invoice_uuid,
        customer_order_item_uuid=m.customer_order_item_uuid,
        price_per_unit=3.0,
        unit=UnitOfMeasure.KG,
        created_at=datetime.utcnow(),
        quantity=3.0,
        material_name="FilterMat",
        total_price=9.0,
        currency=Currency.USD,
        is_deleted=False
    )
    monkeypatch.setattr(
        InvoiceItemRead,
        'from_orm',
        classmethod(lambda cls, obj: dto)
    )
    resp = client.get(f'/invoice_item/?invoice_uuid={m.invoice_uuid}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    assert data['items'][0]['invoice_uuid'] == m.invoice_uuid

# --- BULK DELETE ---

def test_bulk_delete_invoice_items_success(client, monkeypatch):
    now = datetime.utcnow()
    items = [InvoiceItemRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid=str(uuid.uuid4()),
        customer_order_item_uuid=str(uuid.uuid4()),
        price_per_unit=1.0,
        unit=UnitOfMeasure.KG,
        created_at=now,
        quantity=1.0,
        material_name="DelMat",
        total_price=1.0,
        currency=Currency.USD,
        is_deleted=True
    )]
    bulk_read = InvoiceItemBulkRead(items=items)
    monkeypatch.setattr(
        InvoiceItemDomain,
        'delete_items',
        lambda uow, payload: bulk_read
    )
    payload = {"uuids": [it.uuid for it in items]}
    resp = client.delete('/invoice_item/bulk-delete', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['items'][0]['is_deleted'] is True


def test_bulk_delete_invoice_items_validation_error(client):
    with pytest.raises(PydanticValidationError) as excinfo:
        resp = client.delete('/invoice_item/bulk-delete', json={})
        assert resp.status_code == 422
        err = resp.get_json()
        assert err['error'] == 'Validation error'
        missing = {e['loc'][-1] for e in err['details']}
        assert 'uuids' in missing
