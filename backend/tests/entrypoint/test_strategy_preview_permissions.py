"""Who may see the pool preview.

scopes_required is NOT the runtime gate — endpoint_allowed on
(blueprint, method) is, which makes route PLACEMENT the security decision.
These assertions pin both halves mechanically, because getting either wrong
fails silently in the one direction that matters: the dispatcher who plans
trips loses a number they were meant to have, and nobody writes a bug report
about a block that simply never renders.
"""
from app.entrypoint.routes.common.permissions import READ_SHAPED_POST_ENDPOINTS
from app.entrypoint.routes.task_execution import routes


def _scopes(view):
    """The tuple scopes_required recorded on the view."""
    for attr in ("_required_scopes", "required_scopes", "__wrapped_scopes__"):
        if hasattr(view, attr):
            return set(getattr(view, attr))
    raise AssertionError("scopes_required no longer records its tuple on the view")


def test_the_preview_is_visible_to_exactly_who_can_submit_the_form():
    """Anyone who can POST /task-execution/complete must be able to read the
    number printed on the form they are submitting — and nobody wider."""
    assert _scopes(routes.strategy_pool_preview) == _scopes(routes.task_complete)


def test_the_preview_is_not_admin_only():
    """A required set that is a SUBSET of the admin scopes short-circuits to
    admins-only and 403s every fine-grained caller regardless of their ACL."""
    assert not _scopes(routes.strategy_pool_preview).issubset({"admin", "superuser"})


def test_the_preview_checks_as_a_READ_despite_being_a_POST():
    """Without this the chokepoint maps POST -> `create`. A no-op today,
    because every role holding task_execution holds both — which is exactly
    why it gets dropped in review and then 403s the first read-only
    task_execution grant anyone writes, months later."""
    assert "task_execution.strategy_pool_preview" in READ_SHAPED_POST_ENDPOINTS


def test_the_preview_lives_on_task_execution_not_routing_strategy():
    """Five roles that can complete this task hold no routing_strategy grant
    at all (accountant, driver, sales, sales_associate, sales_manager). The
    resource a route lives under IS its audience."""
    import json
    import pathlib

    presets = json.loads(
        (pathlib.Path(routes.__file__).parents[1] / "common" / "role_presets.json").read_text()
    )
    for role in ("accountant", "driver", "sales"):
        grants = presets[role] if isinstance(presets.get(role), dict) else presets[role]
        endpoints = grants.get("endpoints", grants)
        assert endpoints.get("task_execution"), f"{role} must hold task_execution"
