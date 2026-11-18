"""A retried write with the same Idempotency-Key replays instead of repeating (QA DST-3).

A driver on a weak connection can lose the response to a checkout the server
already committed, then tap again; without this, the second tap booked a second
order, invoice, stock deduction and payment.
"""
import json

import pytest
from flask import Flask, g, jsonify

from app.entrypoint.routes.common import idempotency
from app.entrypoint.routes.common.idempotency import StoredResponse, idempotent

ACCOUNT = "acct-1"
KEY = "key-123"


class _Store:
    """In-memory stand-in for the idempotency_record table."""

    def __init__(self):
        self.rows = {}

    def find(self, account_uuid, key):
        return self.rows.get((account_uuid, key))

    def claim(self, account_uuid, user_uuid, key, endpoint):
        if (account_uuid, key) in self.rows:
            return False
        self.rows[(account_uuid, key)] = StoredResponse(endpoint, "pending", None, None)
        return True

    def complete(self, account_uuid, key, status_code, body):
        row = self.rows[(account_uuid, key)]
        self.rows[(account_uuid, key)] = StoredResponse(row.endpoint, "done", status_code, body)

    def release(self, account_uuid, key):
        if self.rows.get((account_uuid, key), StoredResponse("", "", None, None)).state == "pending":
            del self.rows[(account_uuid, key)]


@pytest.fixture
def store(monkeypatch):
    s = _Store()
    monkeypatch.setattr(idempotency, "_find", s.find)
    monkeypatch.setattr(idempotency, "_claim", s.claim)
    monkeypatch.setattr(idempotency, "_complete", s.complete)
    monkeypatch.setattr(idempotency, "_release", s.release)
    monkeypatch.setattr(idempotency, "get_jwt_identity", lambda: "user-1")
    return s


@pytest.fixture
def app(store):
    app = Flask(__name__)
    calls = {"orders": 0}

    @app.before_request
    def _scope():
        g.account_uuid = ACCOUNT

    @app.route("/checkout", methods=["POST"])
    @idempotent
    def checkout():
        calls["orders"] += 1
        return jsonify({"order": calls["orders"]}), 201

    @app.route("/flaky", methods=["POST"])
    @idempotent
    def flaky():
        calls["orders"] += 1
        if calls["orders"] == 1:
            return jsonify({"error": "payment account missing"}), 400
        return jsonify({"order": calls["orders"]}), 201

    @app.route("/other", methods=["POST"])
    @idempotent
    def other():
        return jsonify({"ok": True}), 201

    app.calls = calls
    return app


def _post(client, path, key=KEY):
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(path, headers=headers)


def test_same_key_replays_the_first_response_without_running_again(app):
    client = app.test_client()

    first = _post(client, "/checkout")
    second = _post(client, "/checkout")

    assert app.calls["orders"] == 1, app.calls
    assert second.status_code == first.status_code == 201, (first.status_code, second.status_code)
    assert json.loads(second.data) == json.loads(first.data), (first.data, second.data)
    assert second.headers.get("Idempotent-Replay") == "true", dict(second.headers)


def test_without_a_key_every_request_runs(app):
    client = app.test_client()

    _post(client, "/checkout", key=None)
    _post(client, "/checkout", key=None)

    assert app.calls["orders"] == 2, app.calls


def test_a_failed_request_can_be_retried_with_the_same_key(app):
    client = app.test_client()

    failed = _post(client, "/flaky")
    retried = _post(client, "/flaky")

    assert failed.status_code == 400, failed.status_code
    assert retried.status_code == 201, retried.status_code
    assert app.calls["orders"] == 2, app.calls


def test_a_key_still_pending_is_refused_rather_than_run_twice(app, store):
    store.rows[(ACCOUNT, KEY)] = StoredResponse("POST /checkout", "pending", None, None)

    response = _post(app.test_client(), "/checkout")

    assert response.status_code == 409, response.status_code
    assert app.calls["orders"] == 0, app.calls


def test_reusing_a_key_for_a_different_request_is_refused(app):
    client = app.test_client()
    _post(client, "/checkout")

    response = _post(client, "/other")

    assert response.status_code == 422, response.status_code
