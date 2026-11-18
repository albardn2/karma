"""Replay a client write instead of repeating it when the same request is retried.

A client sends an `Idempotency-Key` header with a write it may have to retry: a
checkout, a payment, a fulfilment, a new stop. The first request with a key runs
and its 2xx response is stored; any later request with that key gets the stored
response back without running again. So a driver whose response was lost on a
weak connection can tap again without booking the sale twice.

Requests without the header behave exactly as before.
"""
import functools
import json
from dataclasses import dataclass
from typing import Callable, Optional

from flask import Response, g, make_response, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.exc import IntegrityError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import IdempotencyRecord

HEADER = "Idempotency-Key"
MAX_KEY_LENGTH = 80


@dataclass(frozen=True)
class StoredResponse:
    endpoint: str
    state: str
    status_code: Optional[int]
    body: Optional[str]


def _find(account_uuid: str, key: str) -> Optional[StoredResponse]:
    with SqlAlchemyUnitOfWork() as uow:
        row = (
            uow.session.query(IdempotencyRecord)
            .filter(IdempotencyRecord.account_uuid == account_uuid, IdempotencyRecord.key == key)
            .first()
        )
        if row is None:
            return None
        return StoredResponse(row.endpoint, row.state, row.status_code, row.response_body)


def _claim(account_uuid: str, user_uuid: Optional[str], key: str, endpoint: str) -> bool:
    """Record the key as pending. False when another request already holds it."""
    with SqlAlchemyUnitOfWork() as uow:
        uow.session.add(
            IdempotencyRecord(
                account_uuid=account_uuid, user_uuid=user_uuid, key=key, endpoint=endpoint, state="pending"
            )
        )
        try:
            uow.commit()
        except IntegrityError:
            uow.session.rollback()
            return False
    return True


def _complete(account_uuid: str, key: str, status_code: int, body: str) -> None:
    with SqlAlchemyUnitOfWork() as uow:
        uow.session.query(IdempotencyRecord).filter(
            IdempotencyRecord.account_uuid == account_uuid, IdempotencyRecord.key == key
        ).update({"state": "done", "status_code": status_code, "response_body": body})
        uow.commit()


def _release(account_uuid: str, key: str) -> None:
    with SqlAlchemyUnitOfWork() as uow:
        uow.session.query(IdempotencyRecord).filter(
            IdempotencyRecord.account_uuid == account_uuid,
            IdempotencyRecord.key == key,
            IdempotencyRecord.state == "pending",
        ).delete()
        uow.commit()


def _json(status: int, payload: dict) -> Response:
    return Response(json.dumps(payload), status=status, mimetype="application/json")


def _replay(stored: StoredResponse, endpoint: str) -> Response:
    if stored.endpoint != endpoint:
        return _json(422, {"error": "This Idempotency-Key was already used for a different request."})
    if stored.state != "done":
        # the first request is still running, or the server stopped before storing
        # its outcome; either way it may already have been recorded
        return _json(409, {
            "error": "This request is still being processed. Check whether it was recorded before trying again.",
            "code": "idempotency_in_progress",
        })
    response = Response(stored.body or "", status=stored.status_code or 200, mimetype="application/json")
    response.headers["Idempotent-Replay"] = "true"
    return response


def idempotent(view: Callable) -> Callable:
    """Run the view at most once per Idempotency-Key in the caller's account.

    Must sit below the auth decorators, so the key is only claimed for a request
    that is allowed to run.
    """

    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        key = (request.headers.get(HEADER) or "").strip()
        account_uuid = getattr(g, "account_uuid", None)
        if not key or not account_uuid:
            return view(*args, **kwargs)
        if len(key) > MAX_KEY_LENGTH:
            return _json(400, {"error": f"{HEADER} must be at most {MAX_KEY_LENGTH} characters."})

        endpoint = f"{request.method} {request.path}"
        stored = _find(account_uuid, key)
        if stored is not None:
            return _replay(stored, endpoint)
        if not _claim(account_uuid, get_jwt_identity(), key, endpoint):
            return _replay(_find(account_uuid, key) or StoredResponse(endpoint, "pending", None, None), endpoint)

        try:
            response = make_response(view(*args, **kwargs))
        except Exception:
            _release(account_uuid, key)
            raise
        if 200 <= response.status_code < 300:
            _complete(account_uuid, key, response.status_code, response.get_data(as_text=True))
        else:
            _release(account_uuid, key)
        return response

    return wrapper
