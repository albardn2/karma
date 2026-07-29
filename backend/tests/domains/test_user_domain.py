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
    # Column(default=...) only fires on flush against a real DB and these
    # tests never flush, so stand in for the NOT NULL defaults here. Without
    # this a real UserRead.from_orm rejects the row (None for a bool/int
    # field), which is why several tests below stub from_orm out entirely.
    object.__setattr__(u, "is_deleted", False)
    object.__setattr__(u, "is_active", True)
    object.__setattr__(u, "track_location", False)
    object.__setattr__(u, "location_ping_seconds", 15)
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
        permission_scope=PermissionScope.OPERATION_MANAGER,
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
    assert dto.permission_scope == PermissionScope.OPERATION_MANAGER


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

    # usernames and emails are unique GLOBALLY (they identify the user at
    # login, before any account is known), so validate_existing queries
    # uow.session directly and deliberately bypasses the tenant-scoped
    # repositories — the clashing row has to be visible there.
    clash = make_user(username="someone_else", email="someone_else@x.com")
    setattr(clash, dup_field, dup_value)
    uow.session_rows[UserModel] = [clash]

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
    """The caller is resolved through uow.session (an unscoped lookup, so
    impersonation still works); a caller whose row is gone must not proceed."""
    return_single, return_all = return_dicts
    user = make_user()
    return_single["user"] = user
    uow = dummy_uow_class(return_single, return_all)
    uow.session_rows[UserModel] = [user]  # "other" is deliberately absent

    with pytest.raises(NotFoundError):
        UserDomain.update_user(
            uow=uow, user_uuid=user.uuid, payload=UserUpdate(), current_user_uuid="other"
        )


def test_update_user_unauthorized_non_admin(dummy_uow_class, return_dicts):
    """A non-admin may not touch somebody else's row at all."""
    return_single, return_all = return_dicts
    user = make_user(permission_scope=PermissionScope.OPERATOR.value)
    away = make_user(
        uuid=str(uuid.uuid4()), permission_scope=PermissionScope.OPERATOR.value
    )
    return_single["user"] = user          # the target
    uow = dummy_uow_class(return_single, return_all)
    uow.session_rows[UserModel] = [user, away]  # the caller is `away`

    with pytest.raises(BadRequestError):
        UserDomain.update_user(
            uow=uow, user_uuid=user.uuid, payload=UserUpdate(), current_user_uuid=away.uuid
        )


def test_update_user_forbidden_scope_change(dummy_uow_class, return_dicts):
    """Editing your OWN row is allowed, but promoting yourself is not."""
    return_single, return_all = return_dicts
    user = make_user(permission_scope=PermissionScope.OPERATOR.value)
    # same user, not admin
    return_single["user"] = user
    uow = dummy_uow_class(return_single, return_all)
    uow.session_rows[UserModel] = [user]

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
    uow.session_rows[UserModel] = [user]

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


# --- DEACTIVATION -----------------------------------------------------------
# A reversible "may not sign in", carried on UserUpdate. Only the write side is
# here; that it actually ends a live session is the request chokepoint's job
# (tests/entrypoint/test_request_identity.py).

def _deactivation_uow(dummy_uow_class, return_dicts, target, caller):
    return_single, return_all = return_dicts
    return_single["user"] = target
    uow = dummy_uow_class(return_single, return_all)
    rows = [target] if caller is target else [target, caller]
    uow.session_rows[UserModel] = rows
    return uow


def test_a_non_admin_cannot_deactivate_anyone(dummy_uow_class, return_dicts):
    target = make_user(permission_scope=PermissionScope.OPERATOR.value)
    caller = make_user(uuid=str(uuid.uuid4()),
                       permission_scope=PermissionScope.SALES.value)
    uow = _deactivation_uow(dummy_uow_class, return_dicts, target, caller)

    with pytest.raises(BadRequestError):
        UserDomain.update_user(
            uow=uow, user_uuid=target.uuid,
            payload=UserUpdate(is_active=False), current_user_uuid=caller.uuid,
        )


def test_a_user_cannot_deactivate_themselves_to_dodge_anything(dummy_uow_class, return_dicts):
    """A non-admin editing their OWN row passes the ownership check, so the
    is_active guard is what has to stop them."""
    user = make_user(permission_scope=PermissionScope.DRIVER.value)
    uow = _deactivation_uow(dummy_uow_class, return_dicts, user, user)

    with pytest.raises(BadRequestError):
        UserDomain.update_user(
            uow=uow, user_uuid=user.uuid,
            payload=UserUpdate(is_active=False), current_user_uuid=user.uuid,
        )


def test_an_admin_cannot_deactivate_their_own_account(dummy_uow_class, return_dicts):
    """They would be locked out on their next request with no way to undo it."""
    admin = make_user(permission_scope=PermissionScope.ADMIN.value)
    uow = _deactivation_uow(dummy_uow_class, return_dicts, admin, admin)

    with pytest.raises(BadRequestError, match="your own account"):
        UserDomain.update_user(
            uow=uow, user_uuid=admin.uuid,
            payload=UserUpdate(is_active=False), current_user_uuid=admin.uuid,
        )


def test_an_admin_deactivates_and_reactivates_somebody_else(monkeypatch, dummy_uow_class, return_dicts):
    target = make_user(permission_scope=PermissionScope.DRIVER.value)
    admin = make_user(uuid=str(uuid.uuid4()),
                      permission_scope=PermissionScope.ADMIN.value)
    monkeypatch.setattr(UserDomain, "validate_existing", lambda **kw: None)

    uow = _deactivation_uow(dummy_uow_class, return_dicts, target, admin)
    UserDomain.update_user(
        uow=uow, user_uuid=target.uuid,
        payload=UserUpdate(is_active=False), current_user_uuid=admin.uuid,
    )
    assert uow.user_repository.saved_model.is_active is False

    # and back again — deactivation is a suspension, not a one-way door
    uow = _deactivation_uow(dummy_uow_class, return_dicts, target, admin)
    UserDomain.update_user(
        uow=uow, user_uuid=target.uuid,
        payload=UserUpdate(is_active=True), current_user_uuid=admin.uuid,
    )
    assert uow.user_repository.saved_model.is_active is True


def test_an_unrelated_edit_leaves_the_flag_alone(monkeypatch, dummy_uow_class, return_dicts):
    """is_active is NOT NULL, so an absent field must not write NULL — the web
    form sends the whole payload on every save."""
    target = make_user(permission_scope=PermissionScope.DRIVER.value)
    admin = make_user(uuid=str(uuid.uuid4()),
                      permission_scope=PermissionScope.ADMIN.value)
    monkeypatch.setattr(UserDomain, "validate_existing", lambda **kw: None)
    uow = _deactivation_uow(dummy_uow_class, return_dicts, target, admin)

    UserDomain.update_user(
        uow=uow, user_uuid=target.uuid,
        payload=UserUpdate(first_name="Renamed"), current_user_uuid=admin.uuid,
    )
    assert uow.user_repository.saved_model.is_active is True


def test_self_service_me_cannot_touch_the_flag():
    """MeUpdate is the only endpoint a non-admin can write themselves through;
    a deactivated user must not be able to switch themselves back on."""
    from app.dto.auth import MeUpdate
    from app.entrypoint.routes.common.errors import BadRequestError as BRE

    with pytest.raises((CoreValidationError, BRE, ValueError)):
        MeUpdate(is_active=True)


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
