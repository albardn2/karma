import uuid
from datetime import datetime
import pytest
from pydantic_core import ValidationError as PydanticValidationError

from app.dto.debit_note_item import (
    DebitNoteItemCreate,
    DebitNoteItemRead,
    DebitNoteItemUpdate,
    DebitNoteItemListParams,
    DebitNoteItemPage,
)
from app.domains.debit_note_item.domain import DebitNoteItemDomain
from app.dto.common_enums import Currency
from app.dto.invoice import InvoiceStatus
from models.common import DebitNoteItem as DebitNoteItemModel
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError

# --- CREATE ---

def test_create_debit_note_item_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = DebitNoteItemRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-1",
        amount=150.0,
        currency=Currency.USD,
        notes="Test note",
        status=InvoiceStatus.PENDING,
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid="vendor-1",
        purchase_order_item_uuid=None,
        created_at=now
    )

    monkeypatch.setattr(
        DebitNoteItemDomain,
        'create_item',
        lambda uow, payload: read_dto
    )

    payload = {
        "amount": read_dto.amount,
        "currency": read_dto.currency.value,
        "status": read_dto.status.value,
        "vendor_uuid": read_dto.vendor_uuid,
        "notes": read_dto.notes
    }

    resp = client.post('/debit_note_item/', json=payload)
    assert resp.status_code == 201
    assert resp.get_json() == read_dto.model_dump(mode='json')


def test_create_debit_note_item_missing_exclusive_field(client):
    # no invoice_item_uuid, customer_order_item_uuid, customer_uuid or vendor_uuid
    payload = {
        "amount": 50.0,
        "currency": "USD",
        "status": "pending"
    }
    with pytest.raises(BadRequestError):
        client.post('/debit_note_item/', json=payload)


def test_create_debit_note_item_multiple_exclusive_fields(client):
    payload = {
        "amount": 75.0,
        "currency": "USD",
        "status": "paid",
        "vendor_uuid": "v1",
        "customer_uuid": "c1"
    }
    with pytest.raises(BadRequestError):
        client.post('/debit_note_item/', json=payload)


# --- GET SINGLE ---

def test_get_debit_note_item_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError):
        client.get(f'/debit_note_item/{random_uuid}')


def test_get_debit_note_item_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    model = DebitNoteItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=200.0,
        currency="USD",
        notes="OK",
        status="pending",
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid="vendor-A",
        purchase_order_item_uuid=None,
        created_at=datetime.utcnow()
    )
    return_single['debit_note_item'] = model

    now = datetime.utcnow()
    read_dto = DebitNoteItemRead(
        uuid=model.uuid,
        created_by_uuid=None,
        amount=model.amount,
        currency=Currency.USD,
        notes=model.notes,
        status=InvoiceStatus.PENDING,
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid=model.vendor_uuid,
        purchase_order_item_uuid=None,
        created_at=now
    )
    monkeypatch.setattr(
        DebitNoteItemRead,
        'from_orm',
        classmethod(lambda cls, obj: read_dto)
    )

    resp = client.get(f'/debit_note_item/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')


# --- UPDATE ---

def test_update_debit_note_item_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError):
        client.put(f'/debit_note_item/{random_uuid}', json={'notes': 'updated'})


def test_update_debit_note_item_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    model = DebitNoteItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=300.0,
        currency="USD",
        notes="old",
        status="pending",
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid="vendor-B",
        purchase_order_item_uuid=None,
        created_at=datetime.utcnow()
    )
    return_single['debit_note_item'] = model

    resp = client.put(f'/debit_note_item/{model.uuid}', json={'notes': 'new note'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['notes'] == 'new note'

    # verify repository.save was called with updated model
    uow = dummy_uow_class.last_instance
    saved: DebitNoteItemModel = uow.debit_note_item_repository.saved_model
    assert saved.notes == 'new note'


# --- DELETE ---

def test_delete_debit_note_item_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError):
        client.delete(f'/debit_note_item/{random_uuid}')


def test_delete_debit_note_item_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = DebitNoteItemRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=400.0,
        currency=Currency.USD,
        notes="to delete",
        status=InvoiceStatus.PAID,
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid="vendor-C",
        purchase_order_item_uuid=None,
        created_at=now
    )
    monkeypatch.setattr(
        DebitNoteItemDomain,
        'delete_item',
        lambda uow, uuid: read_dto
    )

    resp = client.delete(f'/debit_note_item/{read_dto.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')


# --- LIST ---

def test_list_debit_note_items_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts

    m1 = DebitNoteItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=10.0,
        currency="USD",
        notes=None,
        status="pending",
        invoice_item_uuid="inv-1",
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid=None,
        purchase_order_item_uuid="po-1",
        created_at=datetime(2025, 1, 1)
    )
    m2 = DebitNoteItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=20.0,
        currency="USD",
        notes=None,
        status="paid",
        invoice_item_uuid=None,
        customer_order_item_uuid="co-1",
        customer_uuid=None,
        vendor_uuid=None,
        purchase_order_item_uuid=None,
        created_at=datetime(2025, 2, 1)
    )
    return_all['debit_note_item'] = [m1, m2]

    dto1 = DebitNoteItemRead(
        uuid=m1.uuid,
        created_by_uuid=None,
        amount=m1.amount,
        currency=Currency.USD,
        notes=None,
        status=InvoiceStatus.PENDING,
        invoice_item_uuid=m1.invoice_item_uuid,
        customer_order_item_uuid=None,
        customer_uuid=None,
        vendor_uuid=None,
        purchase_order_item_uuid=m1.purchase_order_item_uuid,
        created_at=datetime.utcnow()
    )
    dto2 = DebitNoteItemRead(
        uuid=m2.uuid,
        created_by_uuid=None,
        amount=m2.amount,
        currency=Currency.USD,
        notes=None,
        status=InvoiceStatus.PAID,
        invoice_item_uuid=None,
        customer_order_item_uuid=m2.customer_order_item_uuid,
        customer_uuid=None,
        vendor_uuid=None,
        purchase_order_item_uuid=None,
        created_at=datetime.utcnow()
    )

    monkeypatch.setattr(
        DebitNoteItemRead,
        'from_orm',
        classmethod(lambda cls, obj: dto1 if obj is m1 else dto2)
    )

    resp = client.get('/debit_note_item/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    uuids = {it['uuid'] for it in data['items']}
    assert uuids == {m1.uuid, m2.uuid}


def test_list_debit_note_items_filter_status(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = DebitNoteItemModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        amount=30.0,
        currency="USD",
        notes=None,
        status="paid",
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid="cust-1",
        vendor_uuid=None,
        purchase_order_item_uuid=None,
        created_at=datetime.utcnow()
    )
    return_all['debit_note_item'] = [m]

    read_dto = DebitNoteItemRead(
        uuid=m.uuid,
        created_by_uuid=None,
        amount=m.amount,
        currency=Currency.USD,
        notes=None,
        status=InvoiceStatus.PAID,
        invoice_item_uuid=None,
        customer_order_item_uuid=None,
        customer_uuid=m.customer_uuid,
        vendor_uuid=None,
        purchase_order_item_uuid=None,
        created_at=datetime.utcnow()
    )
    monkeypatch.setattr(
        DebitNoteItemRead,
        'from_orm',
        classmethod(lambda cls, obj: read_dto)
    )

    resp = client.get(f'/debit_note_item/?status=paid')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    assert data['items'][0]['status'] == 'paid'
