"""The request chokepoint that resolves who is calling.

`_load_request_identity` runs before every request and is the single place that
establishes the tenant scope (`g.account_uuid`), the DB-fresh role set
(`g.user_scopes`) and the fine-grained ACL (`g.user_acl`). Everything
downstream trusts it: the UnitOfWork builds every repository from
`g.account_uuid`, and a repository with no account is UNSCOPED — it filters
nothing.

That makes "the token is valid but the user cannot be resolved" a security
decision, not an edge case. It used to `return None`, which Flask reads as
"carry on": the request proceeded with `g` unset, so every query ran without a
tenant filter, `scopes_required` fell back to the token's stale `scopes` claim,
and the per-endpoint ACL gate never ran. Since `DELETE /auth/user/<uuid>` only
soft-deletes and cannot revoke a live token, an offboarded driver replaying
their token read every tenant's data until it expired (24h). Verified against a
local stack at the time: `GET /customer/` returned 267 rows (their own account)
while they existed and 269 (all accounts) once deleted.

So: a readable token naming an unresolvable user must 401, and it must do so
BEFORE anything reads flask.g.
"""
import pytest
from flask import Flask, g

import app as app_module
from app import _load_request_identity


class _Repo:
    def __init__(self, user):
        self._user = user

    def find_one(self, **kwargs):
        # mirrors the real call: find_one(uuid=..., is_deleted=False)
        if self._user is None:
            return None
        if kwargs.get("is_deleted") is False and getattr(self._user, "is_deleted", False):
            return None
        return self._user


class _Uow:
    def __init__(self, user):
        self.user_repository = _Repo(user)
        self.session = self

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    # the account lookup for non-superusers: query(...).filter(...).first()
    def query(self, *_a):
        return self

    def filter(self, *_a):
        return self

    def first(self):
        return (False, None)   # not blocked, no feature cap


class _User:
    is_deleted = False
    is_superuser = False
    is_admin = True                      # admin => g.user_acl is None
    account_uuid = "acct-1"
    permission_scope = "admin"
    permissions = None


def _run_hook(monkeypatch, user, claims={"sub": "user-1"}, path="/customer/"):
    """Invoke the hook in a request context with auth + DB stubbed out."""
    monkeypatch.setattr(app_module, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(user),
                        raising=False)
    import app.adapters.unit_of_work.sqlalchemy_unit_of_work as uow_mod
    monkeypatch.setattr(uow_mod, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(user))

    import flask_jwt_extended
    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", lambda **kw: None)
    monkeypatch.setattr(flask_jwt_extended, "get_jwt", lambda: claims)

    flask_app = Flask(__name__)
    with flask_app.test_request_context(path):
        return _load_request_identity()


def test_a_token_whose_user_is_gone_is_rejected(monkeypatch):
    """The regression that matters: offboarded user replays a live token."""
    result = _run_hook(monkeypatch, user=None)

    assert result is not None, (
        "the hook let a deleted user's request continue — every repository "
        "would run unscoped and read across all tenants"
    )
    response, status = result
    assert status == 401


def test_a_soft_deleted_user_is_rejected_too(monkeypatch):
    """`DELETE /auth/user/<uuid>` only sets is_deleted, so this is the shape
    the real offboarding flow produces."""
    deleted = _User()
    deleted.is_deleted = True
    result = _run_hook(monkeypatch, user=deleted)

    assert result is not None
    assert result[1] == 401


def test_rejection_happens_before_any_tenant_scope_is_established(monkeypatch):
    """A 401 is only safe if nothing downstream can read a half-built g:
    an unset g.account_uuid is exactly what made the leak possible."""
    monkeypatch.setattr(app_module, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(None),
                        raising=False)
    import app.adapters.unit_of_work.sqlalchemy_unit_of_work as uow_mod
    monkeypatch.setattr(uow_mod, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(None))
    import flask_jwt_extended
    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", lambda **kw: None)
    monkeypatch.setattr(flask_jwt_extended, "get_jwt", lambda: {"sub": "ghost"})

    flask_app = Flask(__name__)
    with flask_app.test_request_context("/customer/"):
        result = _load_request_identity()
        assert result[1] == 401
        # nothing was published for the UnitOfWork to pick up
        assert getattr(g, "account_uuid", None) is None
        assert getattr(g, "user_scopes", None) is None
        assert getattr(g, "user_acl", "unset") == "unset"


def test_an_unauthenticated_request_still_passes_through(monkeypatch):
    """Login and signup have no token yet and must run unscoped — the fix must
    not turn those into 401s."""
    import flask_jwt_extended
    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", lambda **kw: None)
    monkeypatch.setattr(flask_jwt_extended, "get_jwt", lambda: {})

    flask_app = Flask(__name__)
    with flask_app.test_request_context("/auth/login"):
        assert _load_request_identity() is None


def test_an_unreadable_token_still_passes_through(monkeypatch):
    """A malformed/expired token raises inside verification; the route's own
    @jwt_required is what rejects it, so the hook must not swallow that job."""
    import flask_jwt_extended

    def boom(**_kw):
        raise RuntimeError("bad token")

    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", boom)

    flask_app = Flask(__name__)
    with flask_app.test_request_context("/customer/"):
        assert _load_request_identity() is None


def test_a_live_user_gets_the_tenant_scope_and_fresh_scopes(monkeypatch):
    """Control: the normal path still publishes what downstream depends on."""
    flask_app = Flask(__name__)
    monkeypatch.setattr(app_module, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(_User()),
                        raising=False)
    import app.adapters.unit_of_work.sqlalchemy_unit_of_work as uow_mod
    monkeypatch.setattr(uow_mod, "SqlAlchemyUnitOfWork", lambda **kw: _Uow(_User()))
    import flask_jwt_extended
    monkeypatch.setattr(flask_jwt_extended, "verify_jwt_in_request", lambda **kw: None)
    monkeypatch.setattr(flask_jwt_extended, "get_jwt", lambda: {"sub": "user-1"})

    with flask_app.test_request_context("/customer/"):
        assert _load_request_identity() is None
        assert g.account_uuid == "acct-1"
        assert g.user_scopes == {"admin"}
        assert g.is_admin is True
