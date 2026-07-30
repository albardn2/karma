"""A company awaiting verification can sign in and do nothing else.

New signups land with `account.is_verified = false`. The requirement is precise
and slightly unusual: the user must be able to LOG IN — and then be told why
nothing works — rather than be refused at the door. That rules out the mechanism
already used for a blocked account, which returns 401 specifically so both
clients' auto-logout machinery revokes the session.

So verification is a 403 raised inside the `request.blueprint in RESOURCE_SET`
block of `_load_request_identity`. `auth` is deliberately NOT in RESOURCE_SET,
which is what keeps /auth/login, /auth/refresh and /auth/me reachable — and
/auth/me is the only channel by which either client discovers it should render
the verification notice instead of the app.

These tests exercise the hook against a registered blueprint, because
`request.blueprint` is None for a bare test route and the whole RESOURCE_SET
block is then skipped — the sibling tests in test_request_identity.py only reach
the checks that run *before* it.
"""
import pytest
from flask import Blueprint, Flask, g

import app as app_module
from app import _load_request_identity
from app.entrypoint.routes.common.permissions import RESOURCE_SET


class _Repo:
    def __init__(self, user):
        self._user = user

    def find_one(self, **kwargs):
        return self._user


class _Uow:
    """Stubs the two lookups the hook makes: the user, then the account row."""

    def __init__(self, user, account_row):
        self.user_repository = _Repo(user)
        self.session = self
        self._account_row = account_row

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    def query(self, *_a):
        return self

    def filter(self, *_a):
        return self

    def first(self):
        # (is_blocked, permissions, is_verified) — positional, and the hook
        # indexes acct[2], so the column order in that query is load-bearing
        return self._account_row


class _User:
    is_deleted = False
    is_active = True
    is_superuser = False
    is_admin = True                      # admin => g.user_acl is None
    account_uuid = "acct-1"
    permission_scope = "admin"
    permissions = None


VERIFIED = (False, None, True)
UNVERIFIED = (False, None, False)


def _run(monkeypatch, account_row, path="/customer/", user=None, blueprint="customer"):
    """Invoke the hook for a request whose blueprint really is registered."""
    user = user or _User()

    monkeypatch.setattr(app_module, "SqlAlchemyUnitOfWork",
                        lambda **kw: _Uow(user, account_row), raising=False)
    import app.adapters.unit_of_work.sqlalchemy_unit_of_work as uow_mod
    monkeypatch.setattr(uow_mod, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(user, account_row))

    import flask_jwt_extended
    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", lambda **kw: None)
    monkeypatch.setattr(flask_jwt_extended, "get_jwt", lambda: {"sub": "user-1"})

    flask_app = Flask(__name__)
    bp = Blueprint(blueprint, __name__)
    bp.add_url_rule("/", "index", lambda: "", methods=["GET"])
    flask_app.register_blueprint(bp, url_prefix=f"/{blueprint}")

    with flask_app.test_request_context(path):
        return _load_request_identity()


def test_the_premise_customer_is_a_gated_resource():
    """If this ever stops being true the tests below would pass vacuously."""
    assert "customer" in RESOURCE_SET
    assert "auth" not in RESOURCE_SET, (
        "auth must stay outside RESOURCE_SET or an unverified user could not "
        "call /auth/me, and neither client could learn to show the notice"
    )


def test_an_unverified_company_is_refused_every_resource(monkeypatch):
    result = _run(monkeypatch, UNVERIFIED)

    assert result is not None, "an unverified account was allowed through"
    response, status = result
    assert status == 403
    assert response.get_json()["code"] == "account_unverified"


def test_the_refusal_is_403_and_not_401(monkeypatch):
    """The one thing that must not regress.

    401 is what a BLOCKED account returns, and both clients treat 401 as
    "session is dead": the web clears the token and reloads to the login page,
    the app fails its refresh and signs out. Returning 401 here would bounce an
    unverified user straight back to the login screen, so they could never see
    the notice — the exact opposite of the requirement that they can sign in.
    """
    _, status = _run(monkeypatch, UNVERIFIED)
    assert status == 403, "401 would log the user out instead of informing them"


def test_a_verified_company_passes_through(monkeypatch):
    assert _run(monkeypatch, VERIFIED) is None


def test_the_code_is_machine_readable_not_just_prose(monkeypatch):
    """Both clients branch on `code`; the message is for humans and may change."""
    response, _ = _run(monkeypatch, UNVERIFIED)
    body = response.get_json()
    assert body["code"] == "account_unverified"
    assert body["msg"]


def test_a_missing_account_row_fails_closed(monkeypatch):
    """An unresolvable account must deny, not admit — the same reasoning as the
    deleted-user branch, which is a fixed security bug in the sibling file."""
    result = _run(monkeypatch, None)

    assert result is not None, "a user whose account cannot be resolved got through"
    assert result[1] == 403


def test_the_platform_owner_is_exempt(monkeypatch):
    """Superusers bypass verification exactly as they bypass is_blocked and the
    tenant feature cap. This is required, not a convenience: it is what lets an
    owner impersonate a pending company to inspect it BEFORE verifying it."""
    owner = _User()
    owner.is_superuser = True
    # the account row is never even read for a superuser; pass the hostile one
    assert _run(monkeypatch, UNVERIFIED, user=owner) is None


def test_verification_is_checked_before_the_finer_gates(monkeypatch):
    """An unverified account should be told it is unverified, not that it lacks a
    permission — the coarser and truer explanation wins.

    Driven by a non-admin whose ACL would deny anyway: the answer must still be
    the verification code rather than a permission failure.
    """
    staff = _User()
    staff.is_admin = False
    staff.permission_scope = "driver"
    staff.permissions = {"endpoints": {}}     # grants nothing

    response, status = _run(monkeypatch, UNVERIFIED, user=staff)
    assert status == 403
    assert response.get_json()["code"] == "account_unverified", (
        "a permission error would send the user chasing the wrong problem"
    )


def test_g_carries_the_flag_for_routes_that_need_it_themselves(monkeypatch):
    """/auth/register lives outside RESOURCE_SET and checks g itself, so the flag
    has to be on g even for a request the block above does not gate."""
    monkeypatch.setattr(app_module, "SqlAlchemyUnitOfWork",
                        lambda **kw: _Uow(_User(), UNVERIFIED), raising=False)
    import app.adapters.unit_of_work.sqlalchemy_unit_of_work as uow_mod
    monkeypatch.setattr(uow_mod, "SqlAlchemyUnitOfWork",
                        lambda **kw: _Uow(_User(), UNVERIFIED))
    import flask_jwt_extended
    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", lambda **kw: None)
    monkeypatch.setattr(flask_jwt_extended, "get_jwt", lambda: {"sub": "user-1"})

    flask_app = Flask(__name__)
    with flask_app.test_request_context("/anything-ungated"):
        result = _load_request_identity()
        assert result is None, "an ungated path must not be blocked by the block"
        assert g.account_verified is False, "the flag never reached g"
