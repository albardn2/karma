import uuid
from datetime import datetime

import pytest
from pydantic import ValidationError
from werkzeug.exceptions import Unauthorized, Conflict
from flask_jwt_extended import create_access_token

from app.dto.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserRead,
    UserUpdate,
    UserListParams,
    PermissionScope,
)
from app.domains.user.domain import UserDomain
from models.common import User as UserModel
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError


def make_user_model(**overrides):
    """Helper to build a minimal UserModel."""
    now = datetime.utcnow()
    base = dict(
        uuid=str(uuid.uuid4()),
        username="user_" + str(uuid.uuid4())[:8],
        first_name="First",
        last_name="Last",
        email="u{}@example.com".format(str(uuid.uuid4())[:4]),
        phone_number="555-0000",
        language="en",
        permission_scope=PermissionScope.ADMIN.value,
        created_at=now,
        is_deleted=False,
        password="$2b$12$dummyhashedpw"  # bcrypt stub
    )
    base.update(overrides)
    return UserModel(**base)


def stub_from_orm(monkeypatch, mapping):
    """
    Monkey-patch UserRead.from_orm so each SQLA model -> prebuilt DTO.
    """
    def _from_orm(cls, obj):
        return mapping[obj.uuid]
    monkeypatch.setattr(UserRead, "from_orm", classmethod(_from_orm))


# --- REGISTER ----------------------------------------------------------------

def test_register_success(client, monkeypatch, dummy_uow_class):
    # stub Domain.create_user to return a UserRead
    now = datetime.utcnow()
    read_dto = UserRead(
        uuid=str(uuid.uuid4()),
        username="newuser",
        first_name="New",
        last_name="User",
        email="new@example.com",
        phone_number="1234",
        language="en",
        permission_scope=PermissionScope.MANAGER,
        created_at=now,
        is_deleted=False,
    )
    monkeypatch.setattr(
        UserDomain,
        "create_user",
        lambda uow, payload: read_dto
    )

    # need an admin token
    admin_uuid = str(uuid.uuid4())
    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=admin_uuid,
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    payload = {
        "username": read_dto.username,
        "first_name": read_dto.first_name,
        "last_name": read_dto.last_name,
        "password": "password123",
        "permission_scope": read_dto.permission_scope.value,
        "email": read_dto.email,
        "phone_number": read_dto.phone_number,
        "language": read_dto.language,
    }
    resp = client.post(
        "/auth/register",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    assert resp.status_code == 201
    assert resp.get_json() == read_dto.model_dump(mode="json")


# def test_register_validation_error(client):
#     # POST with no JSON body → should get a 422 + a Validation error JSON payload
#     resp = client.post("/auth/register", json={})
#     assert resp.status_code == 422
#
#     body = resp.get_json()
#     assert "error" in body and body["error"] == "Validation error"
#     # should complain about missing required fields
#     missing = { e["loc"][-1] for e in body["details"] }
#     assert "username" in missing
#     assert "first_name" in missing
#     assert "last_name" in missing
#     assert "password" in missing
#     assert "permission_scope" in missing
def test_register_validation_error(client, app):
    # first, get an admin token so you pass the @jwt_required() / @scopes_required() guard
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )
    headers = {"Authorization": f"Bearer {token}"}

    # now the payload is empty, so the Pydantic call in the route will throw
    with pytest.raises(ValidationError):
        client.post("/auth/register", json={}, headers=headers)


def test_register_conflict_username(client, dummy_uow_class):
    # if Domain.create_user raises Conflict (username taken)
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        UserDomain,
        "create_user",
        lambda uow, payload: (_ for _ in ()).throw(BadRequestError("Username taken"))
    )

    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )
    with pytest.raises(BadRequestError):
        client.post(
            "/auth/register",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "username": "u",
                "first_name": "F",
                "last_name": "L",
                "password": "p",
                "permission_scope": PermissionScope.ADMIN.value,
            }
        )
    monkeypatch.undo()

#
# # --- LOGIN -------------------------------------------------------------------
#
def test_login_success(client, monkeypatch, return_dicts):
    return_single, _ = return_dicts

    # 1) Build a fake UserModel
    fake_user = UserModel(
        uuid=str(uuid.uuid4()),
        username="joe",
        first_name="Joe",
        last_name="Doe",
        password="",  # we will stub verify_password
        email="joe@example.com",
        permission_scope=PermissionScope.ADMIN.value,
        created_at=datetime.utcnow(),
        phone_number=None,
        language=None,
        # note: is_deleted defaults to False or None
    )

    # 2) Prime DummyRepo.find_one to return our fake_user
    return_single["user"] = fake_user

    # 3) Stub verify_password to always succeed
    monkeypatch.setattr(
        UserModel,
        "verify_password",
        lambda self, raw: True
    )

    # 4) Call the login endpoint
    resp = client.post(
        "/auth/login",
        json={"username": "joe", "password": "doesnt_matter"}
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)

    body = resp.get_json()
    # must contain both tokens
    assert "access_token" in body and "refresh_token" in body

    # make sure they satisfy your Pydantic schema
    tr = TokenResponse(**body)
    assert isinstance(tr.access_token, str)
    assert isinstance(tr.refresh_token, str)

#
def test_login_bad_credentials(client):
    # No need to prime return_single["user"], so find_one() will return None
    resp = client.post(
        "/auth/login",
        json={"username": "noone", "password": "bad"}
    )
    # The route raises Unauthorized, so Flask turns it into a 401 response
    assert resp.status_code == 401
    # Optionally, check the error message appears in the body
    text = resp.get_data(as_text=True)
    assert "Bad credentials" in text

# # --- LOGOUT ------------------------------------------------------------------
#
def test_logout(client):
    resp = client.post("/auth/logout")
    assert resp.status_code == 200
    assert resp.get_json() == {"msg": "Logged out"}

#
# # --- PROFILE (GET) -----------------------------------------------------------
#
def test_get_user_not_found(client, monkeypatch):
    # stub get_jwt_identity
    monkeypatch.setattr("flask_jwt_extended.get_jwt_identity", lambda: str(uuid.uuid4()))
    # UoW find_one → None
    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    with pytest.raises(NotFoundError):
        client.get(f"/auth/user/{str(uuid.uuid4())}", headers={"Authorization": f"Bearer {token}"})


#
def test_get_user_success(client, return_dicts, monkeypatch):
    return_single, _ = return_dicts

    # our target model and current model
    model = make_user_model()
    return_single["user"] = model
    # also allow current_user to be same
    return_single["user"] = model

    now = datetime.utcnow()
    read_dto = UserRead(
        uuid=model.uuid,
        username=model.username,
        first_name=model.first_name,
        last_name=model.last_name,
        email=model.email,
        phone_number=model.phone_number,
        language=model.language,
        created_at=now,
        permission_scope=PermissionScope(model.permission_scope),
        is_deleted=model.is_deleted,
    )
    stub_from_orm(monkeypatch, {model.uuid: read_dto})

    # stub identity
    monkeypatch.setattr("flask_jwt_extended.get_jwt_identity", lambda: model.uuid)
    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )
    resp = client.get(f"/auth/user/{model.uuid}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode="json")

#
# # --- UPDATE ------------------------------------------------------------------
#
def test_update_user_not_found(client, monkeypatch):
    monkeypatch.setattr("flask_jwt_extended.get_jwt_identity", lambda: str(uuid.uuid4()))
    # UoW → None
    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    with pytest.raises(NotFoundError):
        client.put(f"/auth/user/{str(uuid.uuid4())}", json={"first_name": "X"}, headers={"Authorization": f"Bearer {token}"})


def test_update_user_success(client, return_dicts, monkeypatch):
    # --- Arrange ---
    # 1) Prepare a dummy SQLAlchemy model and a matching read-DTO
    model = make_user_model()  # however you construct your fake UserModel
    now = datetime.utcnow()
    read_dto = UserRead(
        uuid=model.uuid,
        username=model.username,
        first_name="X",           # we expect this to be the updated value
        last_name=model.last_name,
        email=model.email,
        phone_number=model.phone_number,
        language=model.language,
        created_at=now,
        permission_scope=PermissionScope(model.permission_scope),
        is_deleted=model.is_deleted,
    )

    # 2) Stub out the UoW so find_one returns our model
    return_single, _ = return_dicts
    return_single["user"] = model

    # 3) Monkey-patch the domain method to just return our read-DTO
    monkeypatch.setattr(
        UserDomain,
        "update_user",
        lambda uow, user_uuid, payload, current_user_uuid: read_dto
    )

    # 4) Monkey-patch JWT identity so @jwt_required sees us as the same user
    monkeypatch.setattr(
        "flask_jwt_extended.get_jwt_identity",
        lambda: model.uuid
    )

    # 5) Create a valid token with the needed scope
    #    We need an application context to call create_access_token:
    with client.application.app_context():
        token = create_access_token(
            identity=model.uuid,
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    # --- Act ---
    resp = client.put(
        f"/auth/user/{model.uuid}",
        json={"first_name": "X"},
        headers={"Authorization": f"Bearer {token}"}
    )

    # --- Assert ---
    assert resp.status_code == 200
    assert resp.get_json() == read_dto.model_dump(mode="json")
#
# # --- DELETE ------------------------------------------------------------------

def test_delete_user_not_found(client, monkeypatch):
    monkeypatch.setattr("flask_jwt_extended.get_jwt_identity", lambda: str(uuid.uuid4()))
    # UoW → None
    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    with pytest.raises(NotFoundError):
        client.delete(f"/auth/user/{str(uuid.uuid4())}", headers={"Authorization": f"Bearer {token}"})


def test_delete_user_success(client, monkeypatch):
    now = datetime.utcnow()
    read_dto = UserRead(
        uuid=str(uuid.uuid4()),
        username="delme",
        first_name="D",
        last_name="M",
        email=None,
        phone_number=None,
        language=None,
        created_at=now,
        permission_scope=PermissionScope.ADMIN,
        is_deleted=True,
    )
    monkeypatch.setattr(
        UserDomain,
        "delete_user",
        lambda uow, user_uuid: read_dto
    )

    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )


    resp = client.delete(f"/auth/user/{read_dto.uuid}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.get_json()["is_deleted"] is True

#
# # --- LIST --------------------------------------------------------------------
#
def test_list_users_default_pagination(client, return_dicts, monkeypatch):
    return_single, return_all = return_dicts

    # prepare two users
    u1 = make_user_model(username="alice")
    u2 = make_user_model(username="bob")
    return_all["user"] = [u1, u2]

    now = datetime.utcnow()
    dto1 = UserRead(
        uuid=u1.uuid,
        username=u1.username,
        first_name=u1.first_name,
        last_name=u1.last_name,
        email=u1.email,
        phone_number=u1.phone_number,
        language=u1.language,
        created_at=now,
        permission_scope=PermissionScope(u1.permission_scope),
        is_deleted=u1.is_deleted,
    )
    dto2 = UserRead(
        uuid=u2.uuid,
        username=u2.username,
        first_name=u2.first_name,
        last_name=u2.last_name,
        email=u2.email,
        phone_number=u2.phone_number,
        language=u2.language,
        created_at=now,
        permission_scope=PermissionScope(u2.permission_scope),
        is_deleted=u2.is_deleted,
    )

    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    resp = client.get("/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total_count"] == 2
    usernames = {u["username"] for u in body["users"]}
    assert usernames == {u1.username, u2.username}

#
def test_list_users_filter_by_username(client, return_dicts, monkeypatch):
    _, return_all = return_dicts
    u = make_user_model(username="charlie")
    return_all["user"] = [u]
    now = datetime.utcnow()
    dto = UserRead(
        uuid=u.uuid,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
        email=u.email,
        phone_number=u.phone_number,
        language=u.language,
        created_at=now,
        permission_scope=PermissionScope(u.permission_scope),
        is_deleted=u.is_deleted,
    )

    app = client.application
    with app.app_context():
        token = create_access_token(
            identity=str(uuid.uuid4()),
            additional_claims={"scopes": [PermissionScope.ADMIN.value]}
        )

    resp = client.get(f"/auth/users?username={u.username}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total_count"] == 1
    assert body["users"][0]["username"] == u.username
