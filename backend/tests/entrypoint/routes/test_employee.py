import uuid
from datetime import datetime
import pytest
from models.common import Employee as EmployeeModel
from app.dto.employee import EmployeeRole


def test_create_employee_success(client, dummy_uow_class):
    payload = {
        "email_address": "john.doe@example.com",
        "full_name": "John Doe",
        "phone_number": "+1-234-567-8901",
        "full_address": "123 Elm Street, Townsville, TX 75001",
        "identification": "https://cdn.example.com/ids/john_doe_id.png",
        "notes": "Part-time contractor, starts May 1",
        "role": EmployeeRole.OPERATOR.value,
        "image": "https://cdn.example.com/photos/john_doe.png"
    }

    resp = client.post("/employee/", json=payload)
    assert resp.status_code == 201

    data = resp.get_json()
    # basic field echo
    assert data["full_name"] == payload["full_name"]
    assert data["phone_number"] == payload["phone_number"]
    assert data["role"] == payload["role"]
    assert isinstance(data["uuid"], str)
    # validate datetime format
    datetime.fromisoformat(data["created_at"])

    # verify save() saw the right model
    uow = dummy_uow_class.last_instance
    saved: EmployeeModel = uow.employee_repository.saved_model
    assert saved.full_name == payload["full_name"]
    assert saved.phone_number == payload["phone_number"]
    assert saved.role == payload["role"]


def test_create_employee_validation_error(client):
    # omit required fields: full_name, phone_number
    resp = client.post("/employee/", json={"email_address": "not-an-email"})
    assert resp.status_code == 400

    errors = resp.get_json()
    assert isinstance(errors, list)
    missing = {e["loc"][-1] for e in errors}
    assert "full_name" in missing
    assert "phone_number" in missing


def test_get_employee_not_found(client):
    resp = client.get(f"/employee/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.get_json() == {"message": "Employee not found"}


def test_get_employee_success(client, return_dicts):
    return_single, _ = return_dicts

    emp = EmployeeModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address="jane.doe@example.com",
        full_name="Jane Doe",
        phone_number="+1-555-111-2222",
        full_address="456 Oak Ave, Metropolis, NY",
        identification=None,
        notes=None,
        role=EmployeeRole.MANAGER.value,
        image=None,
        is_deleted=False
    )
    return_single["employee"] = emp

    resp = client.get(f"/employee/{emp.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["uuid"] == emp.uuid
    assert data["full_name"] == emp.full_name
    assert data["role"] == emp.role


def test_update_employee_success(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    emp = EmployeeModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address="sam.employee@example.com",
        full_name="Sam Employee",
        phone_number="+1-555-333-4444",
        full_address="789 Pine Rd, Gotham, NJ",
        identification=None,
        notes=None,
        role=EmployeeRole.OPERATOR.value,
        image=None,
        is_deleted=False
    )
    return_single["employee"] = emp

    update_payload = {"notes": "Promoted to senior", "role": EmployeeRole.ADMIN.value}
    resp = client.put(f"/employee/{emp.uuid}", json=update_payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["notes"] == update_payload["notes"]
    assert data["role"] == update_payload["role"]

    uow = dummy_uow_class.last_instance
    saved: EmployeeModel = uow.employee_repository.saved_model
    assert saved.notes == update_payload["notes"]
    assert saved.role == update_payload["role"]


def test_delete_employee_marks_deleted(client, return_dicts, dummy_uow_class):
    return_single, _ = return_dicts

    emp = EmployeeModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address=None,
        full_name="To Be Deleted",
        phone_number="+1-555-555-6666",
        full_address=None,
        identification=None,
        notes=None,
        role=None,
        image=None,
        is_deleted=False
    )
    return_single["employee"] = emp

    resp = client.delete(f"/employee/{emp.uuid}")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["is_deleted"] is True

    uow = dummy_uow_class.last_instance
    saved: EmployeeModel = uow.employee_repository.saved_model
    assert saved.is_deleted is True


def test_list_employees(client, return_dicts):
    _, return_all = return_dicts

    e1 = EmployeeModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address=None,
        full_name="Employee One",
        phone_number="+1-555-777-8888",
        full_address=None,
        identification=None,
        notes=None,
        role=None,
        image=None,
        is_deleted=False
    )
    e2 = EmployeeModel(
        uuid=str(uuid.uuid4()),
        created_by_uuid=None,
        created_at=datetime.utcnow(),
        email_address=None,
        full_name="Employee Two",
        phone_number="+1-555-999-0000",
        full_address=None,
        identification=None,
        notes=None,
        role=None,
        image=None,
        is_deleted=False
    )
    return_all["employee"] = [e1, e2]

    resp = client.get("/employee/")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["total_count"] == 2
    names = {item["full_name"] for item in data["employees"]}
    assert names == {e1.full_name, e2.full_name}
