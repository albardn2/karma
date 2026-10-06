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


def test_the_preview_is_registered_under_the_task_execution_blueprint():
    """Placement IS the audience, so assert the ROUTE, not a file path.

    The enforced gate is endpoint_allowed(acl, request.blueprint, method).
    Five roles that can complete this task — accountant, driver, sales and
    its two aliases — hold no routing_strategy grant at all, so moving this
    view to that blueprint would silently take the number away from exactly
    the people who plan trips. An earlier version of this test used
    routes.__file__ as a path anchor and would have passed through such a
    move.

    A bare Flask app rather than create_app(): this needs the url_map, not
    a configured application, and create_app refuses to boot without
    JWT_SECRET_KEY.
    """
    from flask import Flask

    from app.entrypoint.routes.task_execution import task_execution_blueprint

    app = Flask(__name__)
    # the same prefix app/__init__.py mounts it under
    app.register_blueprint(task_execution_blueprint, url_prefix="/task-execution")

    rules = [
        r for r in app.url_map.iter_rules()
        if r.endpoint == "task_execution.strategy_pool_preview"
    ]
    assert len(rules) == 1, "the preview must be registered exactly once"
    assert rules[0].rule == "/task-execution/strategy-pool-preview"
    assert "POST" in rules[0].methods
    # the chokepoint keys on request.blueprint; READ_SHAPED_POST_ENDPOINTS
    # keys on the full endpoint name. They must agree.
    assert rules[0].endpoint.split(".")[0] == "task_execution"
    assert rules[0].endpoint in READ_SHAPED_POST_ENDPOINTS


def test_the_roles_that_can_complete_the_task_hold_a_task_execution_grant():
    """The preview is only useful to someone who can submit the form."""
    import json
    import pathlib

    presets = json.loads(
        (pathlib.Path(routes.__file__).parents[1] / "common" / "role_presets.json").read_text()
    )
    for role in ("accountant", "driver", "sales", "operator", "operation_manager"):
        endpoints = presets[role]["endpoints"]
        assert endpoints.get("task_execution"), f"{role} must hold task_execution"
        # ...and READ specifically, because the chokepoint checks this POST
        # as a read. If this ever fails, the preview 403s for that role while
        # the form it sits on still submits.
        assert "read" in endpoints["task_execution"], (
            f"{role} holds task_execution without `read`, so the pool preview "
            f"would 403 on a form they can still submit"
        )
