# tests/entrypoint/routes/test_process.py
import uuid
from datetime import datetime
import pytest
from pydantic_core import ValidationError as PydanticValidationError

from app.dto.process import (
    ProcessCreate,
    ProcessRead,
    ProcessUpdate,
    ProcessData,
    ProcessInputItem,
    ProcessOutputItem,
    InputsUsedItem,
)
from app.dto.process import ProcessType
from app.domains.process.domain import ProcessDomain
from models.common import Process as ProcessModel
from app.entrypoint.routes.common.errors import NotFoundError

# --- CREATE ---

def test_create_process_success(client, monkeypatch):
    now = datetime.utcnow()
    # build a realistic nested data payload
    data = ProcessData(
        inputs=[
            ProcessInputItem(inventory_uuid=str(uuid.uuid4()), quantity=100.0, cost_per_unit=1.5)
        ],
        outputs=[
            ProcessOutputItem(
                inputs_used=[InputsUsedItem(inventory_uuid=str(uuid.uuid4()), quantity=100.0)],
                material_uuid=str(uuid.uuid4()),
                total_cost=150.0
            )
        ]
    )
    read_dto = ProcessRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-1",
        type=ProcessType.COATED_PEANUT_BATCH,
        notes="test batch",
        data=data,
        created_at=now,
        is_deleted=False
    )
    # stub domain
    monkeypatch.setattr(
        ProcessDomain,
        "create_process",
        lambda uow, payload: read_dto
    )
    payload = {
        "created_by_uuid": read_dto.created_by_uuid,
        "type": read_dto.type.value,
        "notes": read_dto.notes,
        "data": {
            "inputs": [
                {"inventory_uuid": itm.inventory_uuid, "quantity": itm.quantity, "cost_per_unit": itm.cost_per_unit}
                for itm in data.inputs
            ],
            "outputs": [
                {
                    "inputs_used": [
                        {"inventory_uuid": iu.inventory_uuid, "quantity": iu.quantity}
                        for iu in out.inputs_used
                    ],
                    "material_uuid": out.material_uuid,
                    "total_cost": out.total_cost
                }
                for out in data.outputs
            ]
        }
    }
    resp = client.post("/process/", json=payload)
    assert resp.status_code == 201
    assert resp.get_json() == read_dto.model_dump(mode="json")

def test_create_process_validation_error(client):
    # missing required fields => 422
    with pytest.raises(PydanticValidationError):
        resp = client.post("/process/", json={})
        assert resp.status_code == 422
        err = resp.get_json()
        assert err["error"] == "Validation error"
        # should complain about 'type' and 'data'
        missing = {e["loc"][-1] for e in err["details"]}
        assert "type" in missing and "data" in missing

# --- GET ---

def test_get_process_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError):
        client.get(f"/process/{random_uuid}")

def test_get_process_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts
    model = ProcessModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-2",
        type=ProcessType.RAW_PEANUT_FILTER.value,
        notes=None,
        data={},    # ORM model has a JSON/text column, but we stub from_orm below
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_single["process"] = model

    now = datetime.utcnow()
    data = ProcessData(inputs=[], outputs=[])
    read_dto = ProcessRead(
        uuid=model.uuid,
        created_by_uuid=model.created_by_uuid,
        type=model.type,
        notes=model.notes,
        data=data,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        ProcessRead,
        "from_orm",
        classmethod(lambda cls, obj: read_dto)
    )

    resp = client.get(f"/process/{model.uuid}")
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode="json")

# --- UPDATE ---

def test_update_process_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError):
        client.put(f"/process/{random_uuid}", json={"notes": "updated"})

def test_update_process_success(client, monkeypatch):
    now = datetime.utcnow()
    data = ProcessData(inputs=[], outputs=[])
    read_dto = ProcessRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-3",
        type=ProcessType.COATED_PEANUT_BATCH,
        notes="old note",
        data=data,
        created_at=now,
        is_deleted=False
    )
    # stub domain
    monkeypatch.setattr(
        ProcessDomain,
        "update_process",
        lambda uow, uuid, payload: ProcessRead(
            uuid=read_dto.uuid,
            created_by_uuid=read_dto.created_by_uuid,
            type=read_dto.type,
            notes="new note",
            data=data,
            created_at=now,
            is_deleted=False
        )
    )
    resp = client.put(f"/process/{read_dto.uuid}", json={"notes": "new note"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["notes"] == "new note"

# --- DELETE ---

def test_delete_process_not_found(client):
    random_uuid = str(uuid.uuid4())
    with pytest.raises(NotFoundError):
        client.delete(f"/process/{random_uuid}")

def test_delete_process_success(client, monkeypatch):
    now = datetime.utcnow()
    data = ProcessData(inputs=[], outputs=[])
    read_dto = ProcessRead(
        uuid=str(uuid.uuid4()),
        created_by_uuid="user-4",
        type=ProcessType.RAW_PEANUT_FILTER,
        notes=None,
        data=data,
        created_at=now,
        is_deleted=True
    )
    monkeypatch.setattr(
        ProcessDomain,
        "delete_process",
        lambda uow, uuid: read_dto
    )
    resp = client.delete(f"/process/{read_dto.uuid}")
    assert resp.status_code == 200
    assert resp.get_json()["is_deleted"] is True

# --- LIST ---

def test_list_processes_default_pagination(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m1 = ProcessModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid="u1",
        type=ProcessType.COATED_PEANUT_BATCH.value,
        notes="n1",
        data={},
        created_at=datetime(2025,1,1),
        is_deleted=False
    )
    m2 = ProcessModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid="u2",
        type=ProcessType.RAW_PEANUT_FILTER.value,
        notes="n2",
        data={},
        created_at=datetime(2025,2,1),
        is_deleted=False
    )
    return_all["process"] = [m1, m2]

    now = datetime.utcnow()
    data = ProcessData(inputs=[], outputs=[])
    dto1 = ProcessRead(
        uuid=m1.uuid,
        created_by_uuid=m1.created_by_uuid,
        type=m1.type,
        notes=m1.notes,
        data=data,
        created_at=now,
        is_deleted=False
    )
    dto2 = ProcessRead(
        uuid=m2.uuid,
        created_by_uuid=m2.created_by_uuid,
        type=m2.type,
        notes=m2.notes,
        data=data,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        ProcessRead,
        "from_orm",
        classmethod(lambda cls, obj: dto1 if obj is m1 else dto2)
    )

    resp = client.get("/process/")
    assert resp.status_code == 200
    js = resp.get_json()
    assert js["total_count"] == 2
    returned = {p["uuid"] for p in js["items"]}
    assert returned == {m1.uuid, m2.uuid}

def test_list_processes_filter_type(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    m = ProcessModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid="u1",
        type=ProcessType.COATED_PEANUT_POWDER_PREPARATION.value,
        notes=None,
        data={},
        created_at=datetime.utcnow(),
        is_deleted=False
    )
    return_all["process"] = [m]

    now = datetime.utcnow()
    data = ProcessData(inputs=[], outputs=[])
    dto = ProcessRead(
        uuid=m.uuid,
        created_by_uuid=m.created_by_uuid,
        type=m.type,
        notes=m.notes,
        data=data,
        created_at=now,
        is_deleted=False
    )
    monkeypatch.setattr(
        ProcessRead,
        "from_orm",
        classmethod(lambda cls, obj: dto)
    )

    resp = client.get(f"/process/?type={m.type}")
    assert resp.status_code == 200
    js = resp.get_json()
    assert js["total_count"] == 1
    assert js["items"][0]["type"] == m.type
