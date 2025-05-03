import uuid
from datetime import datetime

import pytest
from pydantic_core import ValidationError as CoreValidationError

from app.domains.user.domain import UserDomain
from app.dto.auth import (
    RegisterRequest,
    UserUpdate,
    UserRead,
    PermissionScope,
)
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from models.common import User as UserModel


def make_user(**kwargs) -> UserModel:
    """
    Helper to construct a UserModel with sensible defaults,
    and attach an `is_admin` flag based on permission_scope.
    """
    u = UserModel(
        uuid=kwargs.get("uuid", str(uuid.uuid4())),
        username=kwargs.get("username", "u"),
        first_name=kwargs.get("first_name", "F"),
        last_name=kwargs.get("last_name", "L"),
        password=kwargs.get("password", ""),  # not used here
        email=kwargs.get("email", "e@x.com"),
        permission_scope=kwargs.get(
            "permission_scope", PermissionScope.ADMIN.value
        ),
        created_at=kwargs.get("created_at", datetime.utcnow()),
        phone_number=kwargs.get("phone_number", None),
        language=kwargs.get("language", None),
    )
    # default non‐deleted
    object.__setattr__(u, "is_deleted", False)
    # attach is_admin based on scope
    return u


# --- CREATE_USER ------------------------------------------------------------

def test_create_user_success(monkeypatch, dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    # no existing user by username or email
    return_single["user"] = None
    uow = dummy_uow_class(return_single, return_all)

    payload = RegisterRequest(
        username="newuser",
        first_name="New",
        last_name="User",
        password="secret",
        permission_scope=PermissionScope.MANAGER,
        email="new@example.com",
        phone_number="555-1234",
        language="en",
    )

    # stub from_orm to turn model → DTO
    monkeypatch.setattr(
        UserRead,
        "from_orm",
        classmethod(
            lambda cls, obj: UserRead(
                uuid=obj.uuid,
                username=obj.username,
                first_name=obj.first_name,
                last_name=obj.last_name,
                email=obj.email,
                phone_number=obj.phone_number,
                language=obj.language,
                created_at=obj.created_at,
                permission_scope=PermissionScope(obj.permission_scope),
                is_deleted=obj.is_deleted,
            )
        ),
    )

    dto = UserDomain.create_user(uow=uow, payload=payload)

    # verify it saved a UserModel
    saved: UserModel = uow.user_repository.saved_model
    assert isinstance(saved, UserModel)
    assert saved.username == "newuser"
    # uuid & timestamp assigned
    assert isinstance(saved.uuid, str) and len(saved.uuid) > 0
    assert isinstance(saved.created_at, datetime)
    # DTO matches
    assert dto.username == "newuser"
    assert dto.permission_scope == PermissionScope.MANAGER


@pytest.mark.parametrize(
    "dup_field,dup_value,expected_msg",
    [
        ("username", "exists", "Username 'exists' already taken"),
        ("email", "e@x.com", "Email 'e@x.com' already registered"),
    ],
)
def test_create_user_duplicate(monkeypatch, dummy_uow_class, return_dicts, dup_field, dup_value, expected_msg):
    return_single, return_all = return_dicts
    uow = dummy_uow_class(return_single, return_all)

    # monkey‐patch find_one to raise on the right field
    def fake_find_one(**kw):
        if dup_field in kw:
            return UserModel()  # conflict
        return None

    uow.user_repository.find_one = fake_find_one

    payload = RegisterRequest(
        username="maybe",
        first_name="X",
        last_name="Y",
        password="p",
        permission_scope=PermissionScope.OPERATOR,
        email="e@x.com",
    )
    # inject dup value
    setattr(payload, dup_field, dup_value)

    with pytest.raises(BadRequestError) as exc:
        UserDomain.create_user(uow=uow, payload=payload)
    assert expected_msg in str(exc.value)


# --- UPDATE_USER ------------------------------------------------------------

def test_update_user_not_found(dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    return_single["user"] = None
    uow = dummy_uow_class(return_single, return_all)

    with pytest.raises(NotFoundError):
        UserDomain.update_user(
            uow=uow, user_uuid=str(uuid.uuid4()), payload=UserUpdate(), current_user_uuid="whatever"
        )


def test_update_user_current_not_found(dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    user = make_user()
    return_single["user"] = user
    uow = dummy_uow_class(return_single, return_all)

    # first call returns `user`, second returns None
    seq = [user, None]
    uow.user_repository.find_one = lambda **kw: seq.pop(0)

    with pytest.raises(NotFoundError):
        UserDomain.update_user(
            uow=uow, user_uuid=user.uuid, payload=UserUpdate(), current_user_uuid="other"
        )


def test_update_user_unauthorized_non_admin(dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    user = make_user(permission_scope=PermissionScope.OPERATOR.value)
    away = make_user(
        uuid=str(uuid.uuid4()), permission_scope=PermissionScope.OPERATOR.value
    )
    # both found but neither is admin
    seq = [user, away]
    uow = dummy_uow_class(return_single, return_all)
    uow.user_repository.find_one = lambda **kw: seq.pop(0)

    with pytest.raises(BadRequestError):
        UserDomain.update_user(
            uow=uow, user_uuid=user.uuid, payload=UserUpdate(), current_user_uuid=away.uuid
        )


def test_update_user_forbidden_scope_change(dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    user = make_user(permission_scope=PermissionScope.OPERATOR.value)
    # same user, not admin
    return_single["user"] = user
    uow = dummy_uow_class(return_single, return_all)

    with pytest.raises(BadRequestError):
        UserDomain.update_user(
            uow=uow,
            user_uuid=user.uuid,
            payload=UserUpdate(permission_scope=PermissionScope.ADMIN),
            current_user_uuid=user.uuid,
        )


def test_update_user_success_with_scope_and_fields(monkeypatch, dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    # super‐admin may change anything
    user = make_user(permission_scope=PermissionScope.SUPER_ADMIN.value)
    return_single["user"] = user
    uow = dummy_uow_class(return_single, return_all)

    # no conflicts
    monkeypatch.setattr(UserDomain, "validate_existing", lambda **kw: None)
    # stub DTO
    monkeypatch.setattr(
        UserRead,
        "from_orm",
        classmethod(
            lambda cls, obj: UserRead(
                uuid=obj.uuid,
                username=obj.username,
                first_name=obj.first_name,
                last_name=obj.last_name,
                email=obj.email,
                phone_number=obj.phone_number,
                language=obj.language,
                created_at=obj.created_at,
                permission_scope=PermissionScope(obj.permission_scope),
                is_deleted=obj.is_deleted,
            )
        ),
    )

    payload = UserUpdate(first_name="NewName", permission_scope=PermissionScope.ADMIN)
    dto = UserDomain.update_user(
        uow=uow,
        user_uuid=user.uuid,
        payload=payload,
        current_user_uuid=user.uuid,
    )

    saved = uow.user_repository.saved_model
    assert saved.first_name == "NewName"
    assert saved.permission_scope == PermissionScope.ADMIN.value
    # DTO reflects the change
    assert dto.first_name == "NewName"
    assert dto.permission_scope == PermissionScope.ADMIN


# --- DELETE_USER ------------------------------------------------------------

def test_delete_user_not_found(dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    return_single["user"] = None
    uow = dummy_uow_class(return_single, return_all)

    with pytest.raises(NotFoundError):
        UserDomain.delete_user(uow=uow, user_uuid=str(uuid.uuid4()))


def test_delete_user_success(monkeypatch, dummy_uow_class, return_dicts):
    return_single, return_all = return_dicts
    user = make_user()
    return_single["user"] = user
    uow = dummy_uow_class(return_single, return_all)

    # stub DTO
    monkeypatch.setattr(
        UserRead,
        "from_orm",
        classmethod(
            lambda cls, obj: UserRead(
                uuid=obj.uuid,
                username=obj.username,
                first_name=obj.first_name,
                last_name=obj.last_name,
                email=obj.email,
                phone_number=obj.phone_number,
                language=obj.language,
                created_at=obj.created_at,
                permission_scope=PermissionScope(obj.permission_scope),
                is_deleted=obj.is_deleted,
            )
        ),
    )

    dto = UserDomain.delete_user(uow=uow, user_uuid=user.uuid)
    saved = uow.user_repository.saved_model
    assert saved.is_deleted is True
    assert dto.is_deleted is True
