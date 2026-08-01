"""The fingerprint that tells a client its permissions moved.

The server has always revoked access on the caller's next request — the chokepoint
re-reads their row every time. The CLIENTS were the stale half: both fetch /auth/me
once per provider mount, so a menu built from a since-revoked grant survived until
the app was force-quit, which on a phone that is never force-quit meant until the
14-day refresh token died.

`perms_version` closes that. It rides on every response as a header, and a client
holding a different value knows to re-read its profile. Two properties make or break
it, and both are pinned here:

  * IT MUST MOVE when any governing input moves. A version that misses a change is
    worse than no version at all — the client now has positive confirmation that its
    stale menu is current.
  * IT MUST NOT MOVE otherwise, and in particular must be identical across
    processes. Under gunicorn's several workers, a per-process value would have every
    worker reporting a different version for the same user, and clients would refresh
    on every other request forever.
"""
from app.entrypoint.routes.common.permissions import perms_version

ACL = {"modules": ["customers", "trips"], "endpoints": {"customer": ["read"]}}
CAP = {"modules": ["customers"], "endpoints": {"customer": ["read", "create"]}}


def v(scopes=("sales",), acl=ACL, cap=None, verified=True):
    return perms_version(set(scopes), acl, cap, verified)


# --- it must not move -----------------------------------------------------


def test_the_same_inputs_give_the_same_version():
    assert v() == v()


def test_the_version_is_identical_across_processes():
    """The reason this is a literal and not a self-comparison.

    Python's builtin hash() is salted per process, so `hash(payload)` would satisfy
    every other test in this file and still break in production the moment gunicorn
    ran more than one worker: two workers, two versions for one user, and a client
    refreshing forever. Pinning the actual digest is what catches that swap — a
    self-comparison inside one process cannot.
    """
    assert v() == "497dc95b4eb15822"


def test_scope_order_does_not_matter():
    """Scopes must be sorted, not taken in iteration order.

    Passed as LISTS on purpose. Writing this with sets — the type the chokepoint
    actually passes — makes it tautological: `{"sales","driver"}` and
    `{"driver","sales"}` are one and the same object, so the assertion holds however
    the function orders them and the test proves nothing. A list preserves the
    difference and so actually exercises the sort.
    """
    assert perms_version(["sales", "driver"], ACL, None, True) == perms_version(
        ["driver", "sales"], ACL, None, True
    )


def test_dict_key_order_does_not_matter():
    """JSONB round-trips do not promise key order. Without sort_keys a client would
    refresh because Postgres handed the same grants back in a different order."""
    a = {"endpoints": {"customer": ["read"]}, "modules": ["customers", "trips"]}
    b = {"modules": ["customers", "trips"], "endpoints": {"customer": ["read"]}}
    assert v(acl=a) == v(acl=b)


def test_the_version_is_short_enough_to_be_a_header():
    assert len(v()) == 16
    assert all(c in "0123456789abcdef" for c in v())


# --- it must move ---------------------------------------------------------


def test_a_role_change_moves_it():
    assert v(scopes=("sales",)) != v(scopes=("accountant",))


def test_a_revoked_module_moves_it():
    """The case the whole mechanism exists for: an admin unticks a menu module and
    the app has to stop offering that tile."""
    fewer = {**ACL, "modules": ["trips"]}
    assert v(acl=ACL) != v(acl=fewer)


def test_a_revoked_endpoint_action_moves_it():
    stripped = {**ACL, "endpoints": {"customer": []}}
    assert v(acl=ACL) != v(acl=stripped)


def test_a_tenant_feature_cap_change_moves_it():
    """The platform owner narrowing what a whole company may use has to reach that
    company's users, not just the owner's own console."""
    assert v(cap=None) != v(cap=CAP)


def test_a_verification_flip_moves_it():
    """So a company that has just been approved stops being shown the notice without
    having to force-quit the app."""
    assert v(verified=True) != v(verified=False)


def test_promotion_to_admin_moves_it():
    """An admin carries no permissions object at all — None, not an empty one. That
    must be a different fingerprint from having grants, and from having none."""
    assert v(acl=None) != v(acl=ACL)
    assert v(acl=None) != v(acl={"modules": [], "endpoints": {}})


def test_a_preset_edit_shipped_by_a_deploy_moves_it():
    """Nothing has to know this function exists for a role_presets.json change to
    propagate: the chokepoint passes the RESOLVED acl, so an edited preset arrives
    here as different grants and the version moves on its own."""
    before = {"modules": ["customers"], "endpoints": {"customer": ["read"]}}
    after = {"modules": ["customers"], "endpoints": {"customer": ["read", "update"]}}
    assert v(acl=before) != v(acl=after)


# --- shapes the chokepoint really passes ---------------------------------


def test_an_empty_session_does_not_explode():
    """Defensive: the chokepoint only calls this for an authenticated request, but a
    fingerprint function that raises would turn a permission change into a 500."""
    assert isinstance(perms_version(set(), None, None, False), str)
    assert isinstance(perms_version(None, None, None, True), str)


def test_the_empty_scope_string_is_ignored():
    """`set("".split(","))` is `{""}` — which is exactly what the chokepoint produces
    for a user with no role. It must not read as a distinct scope."""
    assert perms_version({""}, ACL, None, True) == perms_version(set(), ACL, None, True)


def test_truthy_and_boolean_verification_agree():
    """g.account_verified is built with bool() in some branches and read straight from
    the column in others. Both must fingerprint the same."""
    assert perms_version({"sales"}, ACL, None, 1) == perms_version({"sales"}, ACL, None, True)
    assert perms_version({"sales"}, ACL, None, 0) == perms_version({"sales"}, ACL, None, False)
