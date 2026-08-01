"""What a role means by default, and who gets to change it.

A user with no permissions of their own is governed by their role's defaults. Those
defaults were generated from the route decorators into role_presets.json and read
once at import, so changing what a role meant took a commit, a deploy and a restart.
The platform owner can now override them at runtime.

The generated file did not go away — it is the BASELINE, and that is the point of
most of what is pinned here. An override layer over an authorization decision is
only safe if every degenerate case falls back to the baseline rather than to
"nothing" or "everything":

  * a role with no override                  -> baseline
  * an override that is empty / null / junk  -> baseline, not an empty grant
  * an override naming a role we do not have -> ignored, invents nothing

The alternative — treating a missing override as no permissions — would take every
non-admin user's access away the first time the settings row was absent.
"""
import pytest

from app.entrypoint.routes.common import permissions as perms


@pytest.fixture
def no_db_overrides(monkeypatch):
    """Resolution with the database out of the picture, so these stay unit tests."""
    def _set(value):
        monkeypatch.setattr(perms, "role_overrides", lambda: value)
    return _set


# --- resolution ----------------------------------------------------------


def test_with_no_overrides_every_role_is_the_generated_baseline(no_db_overrides):
    no_db_overrides({})
    assert perms.resolved_role_presets() == perms.ROLE_PRESETS_BASELINE


def test_an_override_replaces_only_that_role(no_db_overrides):
    custom = {"modules": ["customers"], "endpoints": {"customer": ["read"]}}
    no_db_overrides({"driver": custom})

    resolved = perms.resolved_role_presets()
    assert resolved["driver"] == custom
    for role in perms.ROLE_PRESETS_BASELINE:
        if role != "driver":
            assert resolved[role] == perms.ROLE_PRESETS_BASELINE[role], (
                f"{role} changed when only driver was overridden"
            )


def test_an_empty_override_falls_back_to_the_baseline(no_db_overrides):
    """THE case that decides whether this feature is safe.

    An override row that exists but holds nothing for a role — a half-written
    save, a hand-edited JSONB, a role added to the enum before anyone configured
    it — must mean "use the baseline", never "grant nothing". The other reading
    silently removes every permission from everyone following that role.
    """
    for empty in ({}, None, {"modules": [], "endpoints": {}}):
        no_db_overrides({"driver": empty})
        resolved = perms.resolved_role_presets()
        expected = (
            empty if empty == {"modules": [], "endpoints": {}}
            else perms.ROLE_PRESETS_BASELINE["driver"]
        )
        # a deliberately-empty-but-present grant is a real choice and is kept;
        # a falsy one is not a choice and falls back
        assert resolved["driver"] == expected, f"{empty!r} resolved wrongly"


def test_an_override_for_an_unknown_role_is_ignored(no_db_overrides):
    """The resolver iterates the baseline, so a stale or misspelled role in the
    settings row cannot introduce a role the code does not know about."""
    no_db_overrides({"wizard": {"modules": ["customers"], "endpoints": {}}})
    resolved = perms.resolved_role_presets()
    assert "wizard" not in resolved
    assert set(resolved) == set(perms.ROLE_PRESETS_BASELINE)


def test_the_baseline_object_is_never_mutated_by_an_override(no_db_overrides):
    """The baseline is the floor to fall back to and the value "reset to default"
    restores, so it has to stay exactly as generated for the life of the process."""
    before = perms.ROLE_PRESETS_BASELINE["driver"]["modules"][:]
    no_db_overrides({"driver": {"modules": [], "endpoints": {}}})
    perms.resolved_role_presets()
    assert perms.ROLE_PRESETS_BASELINE["driver"]["modules"] == before


# --- what actually governs a user ---------------------------------------


def test_preset_for_scope_reads_the_override_not_the_baseline(no_db_overrides):
    """The whole feature in one assertion: an edited role default reaches the
    function the request chokepoint uses, with no deploy and no restart."""
    no_db_overrides({"driver": {"modules": ["trips"], "endpoints": {"trip": ["read"]}}})
    got = perms.preset_for_scope("driver")
    assert got["modules"] == ["trips"]
    assert got["endpoints"] == {"trip": ["read"]}


def test_comma_joined_scopes_still_union_across_resolved_presets(no_db_overrides):
    no_db_overrides({
        "driver": {"modules": ["trips"], "endpoints": {"trip": ["read"]}},
        "operator": {"modules": ["inventory"], "endpoints": {"trip": ["create"]}},
    })
    got = perms.preset_for_scope("driver,operator")
    assert got["modules"] == ["inventory", "trips"]
    assert got["endpoints"] == {"trip": ["create", "read"]}


def test_an_unknown_scope_grants_nothing(no_db_overrides):
    no_db_overrides({})
    assert perms.preset_for_scope("wizard") == {"modules": [], "endpoints": {}}
    assert perms.preset_for_scope("") == {"modules": [], "endpoints": {}}
    assert perms.preset_for_scope(None) == {"modules": [], "endpoints": {}}


def test_a_per_user_override_still_beats_the_role_default(no_db_overrides):
    """Roles are defaults, not ceilings. Editing one user's checklist has to keep
    winning, or the per-user editor becomes decorative the moment a role is
    customised."""
    no_db_overrides({"driver": {"modules": [], "endpoints": {}}})

    class _User:
        permission_scope = "driver"
        permissions = {"modules": ["customers"], "endpoints": {"customer": ["read"]}}

    assert perms.effective_permissions(_User()) == _User.permissions


def test_an_admin_is_unaffected_by_any_role_override(no_db_overrides):
    """Admins carry no permissions object at all — None means full access. A role
    preset must not start governing them just because one now exists in the DB."""
    no_db_overrides({"admin": {"modules": [], "endpoints": {}}})

    class _Admin:
        permission_scope = "admin"
        permissions = None

    assert perms.effective_permissions(_Admin()) is None


# --- the cache ----------------------------------------------------------


def test_the_cache_is_invalidated_rather_than_waited_out():
    """The write path calls this so the admin who saved sees their own change at
    once instead of up to a TTL later."""
    perms._override_cache["at"] = 12345.0
    perms.invalidate_role_overrides()
    assert perms._override_cache["at"] is None


def test_a_settings_read_failure_never_widens_or_removes_access(monkeypatch):
    """This function sits on the authorization path. If the settings table cannot
    be read — unreachable mid-migration, a bad row — it must serve the last known
    value and leave the baseline standing, not raise into a 500 and not return an
    empty grant that reads as "no permissions"."""
    perms._override_cache["at"] = None
    perms._override_cache["value"] = {}

    def _boom(*_a, **_k):
        raise RuntimeError("settings table is unreachable")

    monkeypatch.setattr(perms, "SqlAlchemyUnitOfWork", _boom, raising=False)
    # role_overrides imports the UoW inside the function, so patch the module it
    # imports from instead
    import app.adapters.unit_of_work.sqlalchemy_unit_of_work as uow_mod
    monkeypatch.setattr(uow_mod, "SqlAlchemyUnitOfWork", _boom)

    assert perms.role_overrides() == {}
    assert perms.resolved_role_presets() == perms.ROLE_PRESETS_BASELINE
