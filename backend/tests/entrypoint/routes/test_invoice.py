import uuid
from datetime import datetime
import pytest
from app.dto.invoice import InvoiceRead, InvoiceStatus
from app.dto.common_enums import Currency
from app.domains.invoice.domain import InvoiceDomain
from models.common import Invoice as InvoiceModel
from app.entrypoint.routes.common.errors import NotFoundError
from pydantic import ValidationError as PydanticValidationError
# --- CREATE ---

def test_create_invoice_success(client, monkeypatch):
    # Prepare fake InvoiceRead from domain
    now = datetime.utcnow()
    fake_dto = InvoiceRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=str(uuid.uuid4()),
        customer_uuid=str(uuid.uuid4()),
        customer_order_uuid=str(uuid.uuid4()),
        currency=Currency.USD,
        status=InvoiceStatus.PAID,
        paid_at=now,
        due_date=now,
        notes="Test",
        created_at=now,
        total_amount=100.0,
        amount_paid=100.0,
        amount_due=0.0,
        is_paid=True,
        is_overdue=False,
        is_deleted=False
    )
    monkeypatch.setattr(
        InvoiceDomain,
        'create_invoice',
        lambda uow, payload: fake_dto
    )

    payload = {
        "customer_uuid": fake_dto.customer_uuid,
        "customer_order_uuid": fake_dto.customer_order_uuid,
        "currency": fake_dto.currency.value,
        "due_date": fake_dto.due_date.isoformat(),
        "notes": fake_dto.notes
    }
    resp = client.post('/invoice/', json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['uuid'] == fake_dto.uuid
    assert data['status'] == fake_dto.status.value
    assert data['currency'] == fake_dto.currency.value


def test_create_invoice_validation_error(client):
    # missing required fields: customer_uuid, customer_order_uuid, currency

    with pytest.raises(PydanticValidationError) as excinfo:
        resp = client.post('/invoice/', json={})
        assert resp.status_code == 422
        assert resp.get_json() == {'message': 'Validation error'}

# --- GET ---

def test_get_invoice_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.get(f'/invoice/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Invoice not found'}


def test_get_invoice_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    # Place a real model in the dummy repo
    model = InvoiceModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        customer_uuid="C1",
        customer_order_uuid="O1",
        created_at=datetime.utcnow(),
        currency=Currency.USD.value,
        status=InvoiceStatus.PENDING.value,
        paid_at=None,
        due_date=None,
        notes=None,
    )
    return_single['invoice'] = model
    # Stub from_orm to avoid property errors
    now = datetime.utcnow()
    fake_dto = InvoiceRead(
        uuid=model.uuid,
        created_by_uuid=None,
        customer_uuid=model.customer_uuid,
        customer_order_uuid=model.customer_order_uuid,
        currency=Currency.USD,
        status=InvoiceStatus.PENDING,
        paid_at=None,
        due_date=None,
        notes=None,
        created_at=now,
        total_amount=0.0,
        amount_paid=0.0,
        amount_due=0.0,
        is_paid=True,
        is_overdue=False,
        is_deleted=False
    )
    monkeypatch.setattr(
        InvoiceRead,
        'from_orm',
        classmethod(lambda cls, obj: fake_dto)
    )

    resp = client.get(f'/invoice/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == fake_dto.model_dump(mode='json')

# --- UPDATE ---

def test_update_invoice_success(client, monkeypatch):
    # Stub domain.update_invoice
    now = datetime.utcnow()
    fake_dto = InvoiceRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        customer_uuid=str(uuid.uuid4()),
        customer_order_uuid=str(uuid.uuid4()),
        currency=Currency.USD,
        status=InvoiceStatus.OVERDUE,
        paid_at=None,
        due_date=now,
        notes="Updated",
        created_at=now,
        total_amount=10.0,
        amount_paid=0.0,
        amount_due=10.0,
        is_paid=False,
        is_overdue=True,
        is_deleted=False
    )
    monkeypatch.setattr(
        InvoiceDomain,
        'update_invoice',
        lambda uow, uuid, payload: fake_dto
    )
    payload = {"status": fake_dto.status.value, "notes": fake_dto.notes}
    resp = client.put(f'/invoice/{fake_dto.uuid}', json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == fake_dto.status.value
    assert data['notes'] == fake_dto.notes


def test_update_invoice_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        resp = client.put(f'/invoice/{uuid.uuid4()}', json={"status": InvoiceStatus.PAID.value})
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Invoice not found'}

# --- DELETE ---

def test_delete_invoice_success(client, monkeypatch):
    now = datetime.utcnow()
    fake_dto = InvoiceRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        customer_uuid=str(uuid.uuid4()),
        customer_order_uuid=str(uuid.uuid4()),
        currency=Currency.USD,
        status=InvoiceStatus.VOID,
        paid_at=None,
        due_date=None,
        notes=None,
        created_at=now,
        total_amount=0.0,
        amount_paid=0.0,
        amount_due=0.0,
        is_paid=True,
        is_overdue=False,
        is_deleted=True
    )
    monkeypatch.setattr(
        InvoiceDomain,
        'delete_invoice',
        lambda uow, uuid: fake_dto
    )
    resp = client.delete(f'/invoice/{fake_dto.uuid}')
    assert resp.status_code == 200
    assert resp.get_json()['uuid'] == fake_dto.uuid


def test_delete_invoice_not_found(client, monkeypatch):
    # If domain.delete throws NotFoundError, Flask returns 404
    def _raise(uow, uuid):
        raise NotFoundError('Invoice not found')
    monkeypatch.setattr(InvoiceDomain, 'delete_invoice', _raise)
    with pytest.raises(NotFoundError) as excinfo:
        resp = client.delete(f'/invoice/{uuid.uuid4()}')
        assert resp.status_code == 404

# --- LIST ---

def test_list_invoices_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    # Create two model instances
    m1 = InvoiceModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        customer_uuid="C1",
        customer_order_uuid="O1",
        created_at=datetime(2025,1,1),
        currency=Currency.SYP.value,
        status=InvoiceStatus.PENDING.value,
        paid_at=None,
        due_date=None,
        notes=None,
    )
    m2 = InvoiceModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        customer_uuid="C2",
        customer_order_uuid="O2",
        created_at=datetime(2025,2,1),
        currency=Currency.USD.value,
        status=InvoiceStatus.PAID.value,
        paid_at=None,
        due_date=None,
        notes=None,
    )
    return_all['invoice'] = [m1, m2]
    # Create fake DTOs
    now = datetime.utcnow()
    dto1 = InvoiceRead(
        uuid=m1.uuid,
        created_by_uuid=None,
        customer_uuid=m1.customer_uuid,
        customer_order_uuid=m1.customer_order_uuid,
        currency=Currency.SYP,
        status=InvoiceStatus.PENDING,
        paid_at=None,
        due_date=None,
        notes=None,
        created_at=now,
        total_amount=0,
        amount_paid=0,
        amount_due=0,
        is_paid=True,
        is_overdue=False,
        is_deleted=False
    )
    dto2 = InvoiceRead(
        uuid=m2.uuid,
        created_by_uuid=None,
        customer_uuid=m2.customer_uuid,
        customer_order_uuid=m2.customer_order_uuid,
        currency=Currency.USD,
        status=InvoiceStatus.PAID,
        paid_at=None,
        due_date=None,
        notes=None,
        created_at=now,
        total_amount=0,
        amount_paid=0,
        amount_due=0,
        is_paid=True,
        is_overdue=False,
        is_deleted=False
    )
    # Stub from_orm
    monkeypatch.setattr(
        InvoiceRead,
        'from_orm',
        classmethod(lambda cls, obj: dto1 if obj is m1 else dto2)
    )

    resp = client.get('/invoice/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    ids = {inv['uuid'] for inv in data['invoices']}
    assert ids == {m1.uuid, m2.uuid}


def test_list_invoices_filter_status(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = InvoiceModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        customer_uuid="C3",
        customer_order_uuid="O3",
        created_at=datetime.utcnow(),
        currency=Currency.USD.value,
        status=InvoiceStatus.OVERDUE.value,
        paid_at=None,
        due_date=None,
        notes=None,
    )
    return_all['invoice'] = [m]
    now = datetime.utcnow()
    dto = InvoiceRead(
        uuid=m.uuid,
        created_by_uuid=None,
        customer_uuid=m.customer_uuid,
        customer_order_uuid=m.customer_order_uuid,
        currency=Currency.USD,
        status=InvoiceStatus.OVERDUE,
        paid_at=None,
        due_date=None,
        notes=None,
        created_at=now,
        total_amount=0,
        amount_paid=0,
        amount_due=0,
        is_paid=True,
        is_overdue=False,
        is_deleted=False
    )
    monkeypatch.setattr(InvoiceRead, 'from_orm', classmethod(lambda cls, obj: dto))

    resp = client.get(f'/invoice/?status={dto.status.value}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    assert data['invoices'][0]['status'] == dto.status.value
