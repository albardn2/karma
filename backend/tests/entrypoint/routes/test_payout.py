import uuid
from datetime import datetime
import pytest
from _pytest import monkeypatch
from pydantic_core import ValidationError
from app.dto.payout import PayoutRead
from app.domains.payout.domain import PayoutDomain
from app.dto.payout import PayoutCreate
from app.dto.common_enums import Currency
from models.common import Payout as PayoutModel

from app.entrypoint.routes.common.errors import BadRequestError

from app.entrypoint.routes.common.errors import NotFoundError


def test_create_payout_success(client, monkeypatch):
    # Stub domain.create_payout to return a PayoutRead
    now = datetime.utcnow()
    read_dto = PayoutRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-123",
        purchase_order_uuid="po-456",
        expense_uuid=None,
        amount=123.45,
        currency=Currency.USD,
        notes="Payout notes",
        employee_uuid=None,
        credit_note_item_uuid=None,
        financial_account_uuid="fa-789",
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        PayoutDomain,
        'create_payout',
        lambda uow, payload: read_dto
    )
    payload = {
        "purchase_order_uuid": read_dto.purchase_order_uuid,
        "amount": read_dto.amount,
        "currency": read_dto.currency.value,
        "notes": read_dto.notes,
    }
    resp = client.post('/payout/', json=payload)
    assert resp.status_code == 201
    assert resp.get_json() == read_dto.model_dump(mode='json')

def test_create_payout_missing_exclusive_field(client):
    with pytest.raises(BadRequestError) as excinfo:
        payload = {"amount": 50.0, "currency": "USD"}
        resp = client.post('/payout/', json=payload)
        assert resp.status_code == 400
        assert resp.get_json() == {"message": "At least one of purchase_order_uuid, expense_uuid, or employee_uuid must be set."}

def test_create_payout_multiple_exclusive_fields(client):
    with pytest.raises(BadRequestError) as excinfo:
        payload = {"purchase_order_uuid": "po1", "expense_uuid": "ex1", "amount": 75, "currency": "USD"}
        resp = client.post('/payout/', json=payload)
        assert resp.status_code == 400
        assert resp.get_json() == {"message": "Only one of purchase_order_uuid, expense_uuid, or employee_uuid can be set."}

# # --- GET ---
#
def test_get_payout_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.get(f'/payout/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Payout not found'}

def test_get_payout_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    model = PayoutModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid="poX",
        expense_uuid=None,
        amount=200.0,
        currency="USD",
        financial_account_uuid="faX",
        created_at=datetime.utcnow(),
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        is_deleted=False
    )
    return_single['payout'] = model
    now = datetime.utcnow()
    read_dto = PayoutRead(
        uuid=model.uuid,
        created_by_uuid=None,
        purchase_order_uuid=model.purchase_order_uuid,
        expense_uuid=None,
        amount=model.amount,
        currency=Currency.USD,
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        financial_account_uuid=model.financial_account_uuid,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        PayoutRead,
        'from_orm',
        classmethod(lambda cls, obj: read_dto)
    )
    resp = client.get(f'/payout/{model.uuid}')
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode='json')
#
# # --- UPDATE ---
#
def test_update_payout_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.put(f'/payout/{random_uuid}', json={'notes':'updated'})
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Payout not found'}

def test_update_payout_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts
    model = PayoutModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid="poY",
        expense_uuid=None,
        amount=300.0,
        currency="USD",
        financial_account_uuid="faY",
        created_at=datetime.utcnow(),
        notes="old",
        employee_uuid=None,
        credit_note_item_uuid=None,
        is_deleted=False
    )
    return_single['payout'] = model
    resp = client.put(f'/payout/{model.uuid}', json={'notes':'new notes'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['notes'] == 'new notes'
    # verify repository save
    uow = dummy_uow_class.last_instance
    saved: PayoutModel = uow.payout_repository.saved_model
    assert saved.notes == 'new notes'

# # --- DELETE ---
#
def test_delete_payout_not_found(client):
    with pytest.raises(NotFoundError) as excinfo:
        random_uuid = str(uuid.uuid4())
        resp = client.delete(f'/payout/{random_uuid}')
        assert resp.status_code == 404
        assert resp.get_json() == {'message': 'Payout not found'}

def test_delete_payout_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = PayoutRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid="poZ",
        expense_uuid=None,
        amount=400.0,
        currency=Currency.USD,
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        financial_account_uuid="faZ",
        created_at=now,
        is_deleted=True
    )
    monkeypatch.setattr(
        PayoutDomain,
        'delete_payout',
        lambda uow, uuid: read_dto
    )
    resp = client.delete(f'/payout/{read_dto.uuid}')
    assert resp.status_code == 200
    assert resp.get_json()['is_deleted'] is True

# # --- LIST ---
#
def test_list_payouts_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m1 = PayoutModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid="po1",
        expense_uuid=None,
        amount=10.0,
        currency="USD",
        financial_account_uuid="fa1",
        created_at=datetime(2025,1,1),
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        is_deleted=False
    )
    m2 = PayoutModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid="po2",
        expense_uuid=None,
        amount=20.0,
        currency="USD",
        financial_account_uuid="fa2",
        created_at=datetime(2025,2,1),
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        is_deleted=False
    )
    return_all['payout'] = [m1, m2]
    dto1 = PayoutRead(
        uuid=m1.uuid,
        created_by_uuid=None,
        purchase_order_uuid=m1.purchase_order_uuid,
        expense_uuid=None,
        amount=10.0,
        currency=Currency.USD,
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        financial_account_uuid=m1.financial_account_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    dto2 = PayoutRead(
        uuid=m2.uuid,
        created_by_uuid=None,
        purchase_order_uuid=m2.purchase_order_uuid,
        expense_uuid=None,
        amount=20.0,
        currency=Currency.USD,
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        financial_account_uuid=m2.financial_account_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    monkeypatch.setattr(
        PayoutRead,
        'from_orm',
        classmethod(lambda cls,obj: dto1 if obj is m1 else dto2)
    )
    resp = client.get('/payout/')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 2
    ids = {p['uuid'] for p in data['payouts']}
    assert ids == {m1.uuid, m2.uuid}


def test_list_payouts_filter_purchase_order(client, return_dicts,monkeypatch):
    _, return_all = return_dicts
    m = PayoutModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        purchase_order_uuid="FILTER_PO",
        expense_uuid=None,
        amount=30.0,
        currency="USD",
        financial_account_uuid="faF",
        created_at=datetime.utcnow(),
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        is_deleted=False
    )
    return_all['payout'] = [m]
    read_dto = PayoutRead(
        uuid=m.uuid,
        created_by_uuid=None,
        purchase_order_uuid=m.purchase_order_uuid,
        expense_uuid=None,
        amount=30.0,
        currency=Currency.USD,
        notes=None,
        employee_uuid=None,
        credit_note_item_uuid=None,
        financial_account_uuid=m.financial_account_uuid,
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    monkeypatch.setattr(
        PayoutRead,
        'from_orm',
        classmethod(lambda cls,obj: read_dto)
    )
    resp = client.get(f'/payout/?purchase_order_uuid={m.purchase_order_uuid}')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_count'] == 1
    assert data['payouts'][0]['purchase_order_uuid'] == m.purchase_order_uuid
