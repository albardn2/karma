"""Generate the assistant's endpoint catalog from the Flask route table.

Runs INSIDE the backend environment (it imports the app), e.g.:

    docker run --rm -v "$PWD":/karma -w /karma -e JWT_SECRET_KEY=x \
        karma-backend:local python -m assistant.gen_catalog

and writes assistant/catalog.json. The assistant service itself never imports
the Flask app — it only reads that JSON — so it can run with a tiny dependency
set (anthropic, httpx) and stay decoupled from the API's internals.

For every route it records method, path, blueprint, view name, docstring, the
CRUD action the request chokepoint will demand, and an input schema built from:
  - path parameters (`/<string:uuid>`),
  - a Pydantic model the view instantiates with `Model(**request.args)` or
    `Model(**request.json)` (found by reading the view's source with `ast`),
  - ad-hoc `request.args.get("name")` reads, as optional string parameters.

Routes nobody should reach through the assistant (auth, super-admin, account)
are left out here, not merely filtered later.
"""
from __future__ import annotations

import ast
import inspect
import json
import os
import sys
import textwrap
from pathlib import Path

os.environ.setdefault("JWT_SECRET_KEY", "catalog-generation-only")

EXCLUDED_BLUEPRINTS = {"auth", "super_admin", "account"}
# endpoints that are POST only because their input is structured; mirrors
# READ_SHAPED_POST_ENDPOINTS in app/entrypoint/routes/common/permissions.py
METHOD_ACTIONS = {"POST": "create", "GET": "read", "PUT": "update", "PATCH": "update", "DELETE": "delete"}

OUT = Path(__file__).with_name("catalog.json")


def _request_source(expr, tainted: dict) -> str | None:
    """'args' / 'body' if this expression reads the request query or body."""
    for n in ast.walk(expr):
        if isinstance(n, ast.Name) and n.id in tainted:
            return tainted[n.id]
        if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "request":
            if n.attr == "args":
                return "args"
            if n.attr in ("json", "get_json"):
                return "body"
    return None


def _resolve(name: str, module, local_imports: dict):
    if name in local_imports:
        mod_name, attr = local_imports[name]
        try:
            __import__(mod_name)
            return getattr(sys.modules[mod_name], attr, None)
        except Exception:
            return None
    return getattr(module, name, None)


def _view_models(fn, module, found=None, depth=0, seen=None) -> dict:
    """Find the request models and ad-hoc query args a view reads.

    Looks for `Model(**<request.args|json|get_json()|a variable assigned from
    them>)`, `Model.model_validate(<same>)` and `request.args.get("x")`, in the
    view and (recursively, same module) in the helper functions it calls.
    """
    found = found or {"query_model": None, "body_model": None, "query_args": []}
    seen = seen if seen is not None else set()
    fn = inspect.unwrap(fn)
    if fn in seen or depth > 3:
        return found
    seen.add(fn)
    try:
        src = textwrap.dedent(inspect.getsource(fn))
    except (OSError, TypeError):
        return found
    tree = ast.parse(src)

    local_imports: dict = {}
    tainted: dict = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for a in node.names:
                local_imports[a.asname or a.name] = (node.module, a.name)
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            src_kind = _request_source(node.value, tainted)
            if src_kind:
                tainted[node.targets[0].id] = src_kind

    def record(model_name, kind):
        model = _resolve(model_name, module, local_imports)
        if model is None or not hasattr(model, "model_json_schema"):
            return
        key = "query_model" if kind == "args" else "body_model"
        if not found[key]:
            found[key] = model

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        f = node.func
        # Model(**<request ...>)
        if isinstance(f, ast.Name):
            for kw in node.keywords:
                if kw.arg is None:
                    kind = _request_source(kw.value, tainted)
                    if kind:
                        record(f.id, kind)
        # Model.model_validate(<request ...>)
        if isinstance(f, ast.Attribute) and f.attr == "model_validate" and isinstance(f.value, ast.Name) and node.args:
            kind = _request_source(node.args[0], tainted)
            if kind:
                record(f.value.id, kind)
        # request.args.get("name", ...)
        if (
            isinstance(f, ast.Attribute) and f.attr in ("get", "getlist")
            and isinstance(f.value, ast.Attribute) and f.value.attr == "args"
            and isinstance(f.value.value, ast.Name) and f.value.value.id == "request"
            and node.args and isinstance(node.args[0], ast.Constant)
        ):
            name = node.args[0].value
            if name not in found["query_args"]:
                found["query_args"].append(name)
        # follow same-module helpers
        if isinstance(f, ast.Name):
            helper = getattr(module, f.id, None)
            if inspect.isfunction(helper) and helper.__module__ == module.__name__:
                _view_models(helper, module, found, depth + 1, seen)
    return found


def _schema(model) -> dict:
    s = model.model_json_schema()
    return s


def build() -> list[dict]:
    from app import create_app
    from app.entrypoint.routes.common.permissions import READ_SHAPED_POST_ENDPOINTS

    app = create_app()
    entries = []
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        if rule.endpoint == "static" or "." not in rule.endpoint:
            continue
        blueprint, view_name = rule.endpoint.split(".", 1)
        if blueprint in EXCLUDED_BLUEPRINTS:
            continue
        fn = app.view_functions[rule.endpoint]
        module = sys.modules[inspect.unwrap(fn).__module__]
        models = _view_models(fn, module)
        for method in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            read_shaped = rule.endpoint in READ_SHAPED_POST_ENDPOINTS
            action = "read" if read_shaped else METHOD_ACTIONS.get(method)
            entry = {
                "name": f"{blueprint}__{view_name}"[:64],
                "endpoint": rule.endpoint,
                "blueprint": blueprint,
                "method": method,
                "path": rule.rule,
                "path_params": sorted(rule.arguments),
                "action": action,
                "is_read": action == "read",
                "required_scopes": list(getattr(fn, "_required_scopes", ()) or ()),
                "doc": inspect.cleandoc(inspect.unwrap(fn).__doc__ or ""),
                "query_schema": _schema(models["query_model"]) if models["query_model"] else None,
                "query_model": models["query_model"].__name__ if models["query_model"] else None,
                "query_args": models["query_args"],
                "body_schema": _schema(models["body_model"]) if models["body_model"] else None,
                "body_model": models["body_model"].__name__ if models["body_model"] else None,
            }
            entries.append(entry)
    # a view registered under two methods gets one name per method
    seen: dict[str, int] = {}
    for e in entries:
        if e["name"] in seen:
            e["name"] = f"{e['name']}__{e['method'].lower()}"[:64]
        seen[e["name"]] = 1
    return entries


def main():
    entries = build()
    OUT.write_text(json.dumps(entries, indent=1, sort_keys=True, default=str))
    reads = sum(1 for e in entries if e["is_read"])
    print(f"wrote {len(entries)} endpoints ({reads} reads) to {OUT}")


if __name__ == "__main__":
    main()
