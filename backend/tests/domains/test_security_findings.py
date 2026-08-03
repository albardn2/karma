"""Three defects that each let bad data through a path that looked like it validated.

CROSS-TENANT LOCATION LEAK. The MQTT topic prefix was `karma-grp/location/{env}` —
one namespace for every tenant — and /location/client-config hands it to every
authenticated user. The web live map subscribes to `{prefix}/+` and stores whatever
arrives, so any admin saw every other tenant's driver positions. Live, not
theoretical. The prefix is now per account.

PASSWORD WIPE. update_user put `password` through the same setattr loop as every
other field and only hashed it afterwards `if payload.password`. PUT
{"password": ""} therefore wrote the empty string straight into the column and
skipped hashing, leaving a non-hash there and locking the account out of every
login — reproduced against a real user before the fix, which then could not log in
with its own password, the empty string, or anything else.

ORPHAN DEBIT NOTE. DebitNoteItemCreate checked "at most one" reference but not "at
least one", so a note with no reference was accepted with 201 and became money owed
by nobody. credit_note_item.py has always had that guard; this file lacked it.
"""
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.dto.credit_note_item import CreditNoteItemCreate
from app.dto.debit_note_item import DebitNoteItemCreate
from app.entrypoint.routes.common.errors import BadRequestError


# --------------------------------------------------------------------------
# 1. the location topic namespace
# --------------------------------------------------------------------------

def _broker_config(account_uuid):
    from app.entrypoint.routes.location.routes import _broker_config as fn
    return fn(account_uuid)


def test_topic_prefix_is_scoped_to_the_account():
    assert _broker_config("acct-1111")["topic_prefix"].endswith("/acct-1111")


def test_two_accounts_get_different_namespaces():
    assert (
        _broker_config("acct-1111")["topic_prefix"]
        != _broker_config("acct-2222")["topic_prefix"]
    )


def test_neither_accounts_wildcard_reaches_the_other():
    """`{prefix}/+` must not match a topic under a different account."""
    a = _broker_config("acct-1111")["topic_prefix"]
    b = _broker_config("acct-2222")["topic_prefix"]
    assert not b.startswith(a + "/")
    assert not a.startswith(b + "/")


def test_a_user_topic_sits_under_its_own_account_prefix():
    prefix = _broker_config("acct-1111")["topic_prefix"]
    topic = f"{prefix}/user-9"
    assert topic.startswith(prefix + "/")
    # one level of wildcard reaches it, which is what the live map subscribes to
    assert topic[len(prefix) + 1:].count("/") == 0


# --------------------------------------------------------------------------
# the ingest service's topic parser, which has to read both shapes
# --------------------------------------------------------------------------

def _split(topic, prefix="karma-grp/location/dev"):
    """Exercise the real parser with a known prefix."""
    import location_ingest.__main__ as ingest

    original = ingest.TOPIC_PREFIX
    ingest.TOPIC_PREFIX = prefix
    try:
        return ingest._split_topic(topic)
    finally:
        ingest.TOPIC_PREFIX = original


def test_split_reads_the_account_scoped_topic():
    assert _split("karma-grp/location/dev/acct-1/user-2") == ("acct-1", "user-2")


def test_split_still_reads_the_legacy_topic():
    """An app build in someone's pocket publishes here until it re-reads config."""
    assert _split("karma-grp/location/dev/user-2") == (None, "user-2")


def test_split_rejects_a_topic_outside_the_prefix():
    assert _split("somewhere/else/user-2") == (None, None)


def test_split_rejects_extra_segments():
    assert _split("karma-grp/location/dev/a/b/c") == (None, None)


def test_split_rejects_an_empty_user_segment():
    assert _split("karma-grp/location/dev/acct-1/") == ("acct-1", None)


# --------------------------------------------------------------------------
# 2. the password wipe
# --------------------------------------------------------------------------

class _FakeUser:
    """Just enough user to exercise the update path's field handling."""

    def __init__(self):
        self.password = "$2b$12$originalhashvalue"
        self.username = "someone"
        self.first_name = "Some"
        self.permission_scope = "sales"
        self.is_admin = True
        self.is_superuser = False
        self.set_password_calls = []

    def set_password(self, plaintext):
        self.set_password_calls.append(plaintext)
        self.password = f"$2b$12$hash-of-{plaintext}"


def _real_update(payload_fields):
    """Call the REAL UserDomain.update_user with the database mocked out.

    Deliberately the real function rather than a copy of its body: a test that
    mirrors the code it guards passes happily while the code drifts away from it.
    """
    from app.domains.user.domain import UserDomain
    from app.dto.auth import UserUpdate
    import app.domains.user.domain as mod

    user = _FakeUser()
    actor = MagicMock()
    actor.is_admin = True
    actor.is_superuser = True

    uow = MagicMock()
    uow.user_repository.find_one.return_value = user
    uow.session.query.return_value.filter_by.return_value.one_or_none.return_value = actor

    original_validate = UserDomain.validate_existing
    original_read = mod.UserRead
    UserDomain.validate_existing = staticmethod(lambda **kwargs: None)
    mod.UserRead = MagicMock()  # from_orm would need a real model
    try:
        UserDomain.update_user(
            uow=uow,
            user_uuid="u-1",
            payload=UserUpdate(**payload_fields),
            current_user_uuid="admin-1",
        )
    finally:
        UserDomain.validate_existing = original_validate
        mod.UserRead = original_read
    return user


@pytest.mark.parametrize("empty", ["", "   ", "\t", "\n"])
def test_an_empty_password_is_refused_not_written(empty):
    with pytest.raises(BadRequestError):
        _real_update({"password": empty})


def test_a_real_password_is_hashed_never_assigned_raw():
    user = _real_update({"password": "properNewPass1"})
    assert user.set_password_calls == ["properNewPass1"]
    assert user.password.startswith("$2b$12$hash-of-")


def test_an_absent_password_leaves_the_column_alone():
    user = _real_update({"first_name": "Changed"})
    assert user.password == "$2b$12$originalhashvalue"
    assert user.set_password_calls == []
    assert user.first_name == "Changed"


def test_an_explicit_null_password_means_leave_unchanged():
    user = _real_update({"password": None})
    assert user.password == "$2b$12$originalhashvalue"
    assert user.set_password_calls == []


def test_the_password_never_reaches_the_column_unhashed():
    """The defect was ordering: setattr wrote it, then hashing only ran if truthy."""
    user = _real_update({"password": "abc12345"})
    assert user.password.startswith("$2b$12$")
    assert user.password != "abc12345"


# --------------------------------------------------------------------------
# 3. the orphan debit note
# --------------------------------------------------------------------------

def _note(cls, **refs):
    return cls(amount=11, currency="USD", **refs)


def test_a_debit_note_with_no_reference_is_refused():
    with pytest.raises((BadRequestError, ValidationError)):
        _note(DebitNoteItemCreate)


@pytest.mark.parametrize(
    "ref",
    ["invoice_item_uuid", "purchase_order_item_uuid", "customer_uuid", "vendor_uuid"],
)
def test_a_debit_note_with_exactly_one_reference_is_accepted(ref):
    assert getattr(_note(DebitNoteItemCreate, **{ref: "ref-1"}), ref) == "ref-1"


def test_a_debit_note_with_two_references_is_refused():
    with pytest.raises((BadRequestError, ValidationError)):
        _note(DebitNoteItemCreate, customer_uuid="c-1", vendor_uuid="v-1")


def test_debit_and_credit_notes_now_agree_on_the_rule():
    """The whole defect was that these two diverged."""
    for cls in (DebitNoteItemCreate, CreditNoteItemCreate):
        with pytest.raises((BadRequestError, ValidationError)):
            _note(cls)
        assert _note(cls, customer_uuid="c-1").customer_uuid == "c-1"
        with pytest.raises((BadRequestError, ValidationError)):
            _note(cls, customer_uuid="c-1", vendor_uuid="v-1")
