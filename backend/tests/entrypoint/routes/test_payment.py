import uuid
from datetime import datetime
import pytest
from app.dto.payment import PaymentRead
from app.domains.payment.domain import PaymentDomain
from app.dto.common_enums import Currency
from app.dto.payment import PaymentMethod
from models.common import Payment as PaymentModel
from pydantic import ValidationError as PydanticValidationError
from app.entrypoint.routes.common.errors import NotFoundError

# --- CREATE ---

def test_create_payment_success(client, monkeypatch):
    # Prepare a fake read DTO
    now = datetime.utcnow()
    read_dto = PaymentRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="creator-uuid",
        invoice_uuid="inv-uuid",
        financial_account_uuid="fa-uuid",
        amount=100.0,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes="Test payment",
        debit_note_item_uuid=None,
        created_at=now,
        is_deleted=False
    )
    # Stub domain.create_payment
    monkeypatch.setattr(
        PaymentDomain,
        'create_payment',
        lambda uow, payload: read_dto
    )
    payload = {
        "invoice_uuid": read_dto.invoice_uuid,
        "financial_account_uuid": read_dto.financial_account_uuid,
        "amount": read_dto.amount,
        "currency": read_dto.currency.value,
        "payment_method": read_dto.payment_method.value,
        "notes": read_dto.notes,
        "debit_note_item_uuid": read_dto.debit_note_item_uuid
    }
    resp = client.post('/payment/', json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data['uuid'] == read_dto.uuid
    assert data['amount'] == 100.0

def test_create_payment_validation_error(client):
    # Missing required fields
    with pytest.raises(PydanticValidationError) as excinfo:
        resp = client.post('/payment/', json={})
        assert resp.status_code == 422
        err = resp.get_json()
        assert err['error'] == 'Validation error'
        missing = {e['loc'][-1] for e in err['details']}
        for field in ['invoice_uuid','financial_account_uuid','amount','currency','payment_method']:
            assert field in missing

# --- GET ---

def test_get_payment_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.get(f'/payment/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Payment not found'}

def test_get_payment_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    model = PaymentModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="inv1",
        financial_account_uuid="fa1",
        amount=50.0,
        currency="USD",
        payment_method="cash",
        created_at=datetime.utcnow(),
        notes=None,
        debit_note_item_uuid=None,
        is_deleted=False
    )
    return_single['payment'] = model
    now = datetime.utcnow()
    read_dto = PaymentRead(
        uuid=model.uuid,
        created_by_uuid=None,
        invoice_uuid=model.invoice_uuid,
        financial_account_uuid=model.financial_account_uuid,
        amount=model.amount,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes=None,
        debit_note_item_uuid=None,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        PaymentRead,
        'from_orm',
        classmethod(lambda cls,o: read_dto)
    )
    resp = client.get(f'/payment/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')

# --- UPDATE ---

def test_update_payment_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.put(f'/payment/{random_uuid}', json={'notes':'new'})
        assert resp.status_code == 404
        assert resp.get_json() == {'message':'Payment not found'}

def test_update_payment_success(client, return_dicts, monkeypatch, dummy_uow_class):
    return_single, _ = return_dicts
    model = PaymentModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="inv2",
        financial_account_uuid="fa2",
        amount=75.0,
        currency="USD",
        payment_method="cash",
        created_at=datetime.utcnow(),
        notes="old",
        debit_note_item_uuid=None,
        is_deleted=False
    )
    return_single['payment'] = model
    # monkeypatch save result via from_orm
    now = datetime.utcnow()
    read_dto = PaymentRead(
        uuid=model.uuid,
        created_by_uuid=None,
        invoice_uuid=model.invoice_uuid,
        financial_account_uuid=model.financial_account_uuid,
        amount=75.0,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes="updated",
        debit_note_item_uuid=None,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        PaymentRead,
        'from_orm',
        classmethod(lambda cls,o: read_dto)
    )
    payload = {'notes':'updated'}
    resp = client.put(f'/payment/{model.uuid}', json=payload)
    assert resp.status_code == 200
    assert resp.get_json()['notes']== 'updated'

# --- DELETE ---

def test_delete_payment_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.delete(f'/payment/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message':'Payment not found'}

def test_delete_payment_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = PaymentRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="inv3",
        financial_account_uuid="fa3",
        amount=30.0,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes=None,
        debit_note_item_uuid=None,
        created_at=now,
        is_deleted=True
    )
    monkeypatch.setattr(
        PaymentDomain,
        'delete_payment',
        lambda uow, uuid: read_dto
    )
    resp = client.delete(f'/payment/{read_dto.uuid}')
    assert resp.status_code == 200
    assert resp.get_json()['is_deleted'] is True

# --- LIST ---

def test_list_payments_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m1 = PaymentModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="invA",
        financial_account_uuid="faA",
        amount=10.0,
        currency="USD",
        payment_method="cash",
        created_at=datetime(2025,1,1),
        notes=None,
        debit_note_item_uuid=None,
        is_deleted=False
    )
    m2 = PaymentModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="invB",
        financial_account_uuid="faB",
        amount=20.0,
        currency="USD",
        payment_method="cash",
        created_at=datetime(2025,2,1),
        notes=None,
        debit_note_item_uuid=None,
        is_deleted=False
    )
    return_all['payment'] = [m1,m2]
    dto1 = PaymentRead(
        uuid=m1.uuid,
        created_by_uuid=None,
        invoice_uuid=m1.invoice_uuid,
        financial_account_uuid=m1.financial_account_uuid,
        amount=10.0,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes=None,
        debit_note_item_uuid=None,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    dto2 = PaymentRead(
        uuid=m2.uuid,
        created_by_uuid=None,
        invoice_uuid=m2.invoice_uuid,
        financial_account_uuid=m2.financial_account_uuid,
        amount=20.0,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes=None,
        debit_note_item_uuid=None,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    monkeypatch.setattr(
        PaymentRead,
        'from_orm',
        classmethod(lambda cls,obj: dto1 if obj is m1 else dto2)
    )
    resp = client.get('/payment/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count']==2
    ids={p['uuid'] for p in data['payments']}
    assert ids=={m1.uuid,m2.uuid}


def test_list_payments_filtering(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = PaymentModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        invoice_uuid="FILTER_INV",
        financial_account_uuid="FILTER_FA",
        amount=5.0,
        currency="USD",
        payment_method="cash",
        created_at=datetime.utcnow(),
        notes=None,
        debit_note_item_uuid=None,
        is_deleted=False
    )
    return_all['payment']=[m]
    dto = PaymentRead(
        uuid=m.uuid,
        created_by_uuid=None,
        invoice_uuid=m.invoice_uuid,
        financial_account_uuid=m.financial_account_uuid,
        amount=5.0,
        currency=Currency.USD,
        payment_method=PaymentMethod.CASH,
        notes=None,
        debit_note_item_uuid=None,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    monkeypatch.setattr(PaymentRead,'from_orm',classmethod(lambda cls,obj: dto))
    resp=client.get(f'/payment/?invoice_uuid={m.invoice_uuid}&financial_account_uuid={m.financial_account_uuid}')
    assert resp.status_code==200
    data=resp.get_json()
    assert data['total_count']==1
    p=data['payments'][0]
    assert p['invoice_uuid']==m.invoice_uuid
    assert p['financial_account_uuid']==m.financial_account_uuid
