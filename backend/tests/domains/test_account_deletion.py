"""A company admin deleting their own company: a soft delete, behind a password."""
import inspect
from unittest.mock import MagicMock

import pytest

from app.domains.account.domain import AccountDeletionRefused, AccountDomain
from app.dto.auth import AccountDeleteRequest

PASSWORD = "correct-horse"
ACCOUNT_UUID = "acct-1"


class _User:
    account_uuid = ACCOUNT_UUID

    def __init__(self, scope="admin"):
        self.permission_scope = scope

    @property
    def is_admin(self):
        return any(s in ("admin", "superuser") for s in self.permission_scope.split(","))

    @property
    def is_superuser(self):
        return "superuser" in self.permission_scope.split(",")

    def verify_password(self, plaintext):
        return plaintext == PASSWORD


class _Account:
    uuid = ACCOUNT_UUID
    is_deleted = False


def _uow(account):
    uow = MagicMock()
    uow.account_repository.find_one.return_value = account
    return uow


def test_an_admin_with_the_right_password_soft_deletes_their_company():
    account = _Account()
    uow = _uow(account)

    deleted = AccountDomain.delete_own_account(uow=uow, user=_User(), password=PASSWORD)

    assert deleted is account and account.is_deleted is True
    uow.account_repository.find_one.assert_called_once_with(uuid=ACCOUNT_UUID, is_deleted=False)
    uow.session.delete.assert_not_called()


@pytest.mark.parametrize(
    "scope, password, code",
    [
        ("admin", "wrong", "wrong_password"),
        ("sales", PASSWORD, "not_admin"),
        ("driver", PASSWORD, "not_admin"),
        ("superuser,admin", PASSWORD, "platform_owner"),
    ],
)
def test_deletion_is_refused_and_nothing_changes(scope, password, code):
    account = _Account()

    with pytest.raises(AccountDeletionRefused) as refused:
        AccountDomain.delete_own_account(uow=_uow(account), user=_User(scope), password=password)

    assert refused.value.payload == {"code": code}
    assert account.is_deleted is False


def test_a_refusal_is_403_so_the_app_does_not_sign_the_user_out():
    """Both clients sign out on a 401; a mistyped password must not do that."""
    with pytest.raises(AccountDeletionRefused) as refused:
        AccountDomain.delete_own_account(uow=_uow(_Account()), user=_User(), password="wrong")

    assert refused.value.status_code == 403


def test_an_already_deleted_company_cannot_be_deleted_again():
    with pytest.raises(AccountDeletionRefused) as refused:
        AccountDomain.delete_own_account(uow=_uow(None), user=_User(), password=PASSWORD)

    assert refused.value.payload == {"code": "account_missing"}


def test_the_request_requires_a_password():
    with pytest.raises(Exception):
        AccountDeleteRequest(password="")


@pytest.mark.parametrize("route", ["login", "refresh"])
def test_sign_in_and_token_refresh_refuse_a_deleted_company(route):
    from app.entrypoint.routes.auth import routes

    src = inspect.getsource(getattr(routes, route))

    assert "account.is_deleted" in src
    assert 'Unauthorized("This account has been deleted")' in src


def test_the_endpoint_is_reachable_by_an_unverified_company():
    """Apple's review signs up and lands on the pending-verification screen, so
    deletion has to work before verification: it lives outside RESOURCE_SET."""
    from app.entrypoint.routes.common.permissions import RESOURCE_SET

    assert "auth" not in RESOURCE_SET
