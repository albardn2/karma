"""Where a DTO and its table disagree, and what the caller is told about it.

Three bugs sat here together, all with the same shape: the DTO described a
column inaccurately, and the caller was handed something that pointed away from
the real cause.

- WarehouseListParams.uuid was typed UUID while warehouse.uuid is varchar(36),
  so Postgres refused the comparison and ?uuid= was a 500 for every request.
- purchase_order_item.currency and .unit are NOT NULL but were Optional, so an
  omitted currency reached the database and came back as 409 "Conflicts with an
  existing record" — a schema mismatch reported as a conflict the caller caused.
  Tightening the DTO looked like the fix and was not: the fields are DERIVED
  (currency from the order, unit from the material), and requiring them broke
  every purchase order creation from the UI, which does not send them. They are
  optional again, and PurchaseOrderItemDomain.resolve_currency_and_unit fills
  them on every create path — which is the same conclusion this file already
  reached for the other five pairs below.
- Trip filters referenced TripModel.service_area_uuid and .geometry, neither of
  which exists on the model, so both params were AttributeError → 500.

The audit that found the second one also found five more Optional-vs-NOT NULL
pairs that are *deliberate*, because a domain fills them in (inventory.lot_id is
generated; purchase_order_uuid is Optional so a PO can be created with its items
nested). Those must stay optional, which is why the durable fix is the error
handler telling the truth rather than tightening each DTO.
"""
from uuid import UUID

import pytest
from psycopg2.errors import NotNullViolation, UniqueViolation
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from flask import Flask

from app.dto.purchase_order_item import PurchaseOrderItemCreate
from app.dto.warehouse import WarehouseListParams
from app.entrypoint.routes.common.errors import (
    _not_null_column,
    register_error_handlers,
)


class _Orig(Exception):
    """Stand-in for a psycopg2 error carrying only its message."""


def _integrity(message: str, orig_cls=_Orig):
    return IntegrityError("INSERT ...", {}, orig_cls(message))


@pytest.fixture
def error_app():
    """A bare app with only the error handlers.

    Deliberately not the conftest `app` fixture: that one wires blueprints and JWT
    but never calls register_error_handlers, so an IntegrityError raised in a view
    propagates instead of being converted — which is what is under test here.
    """
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["PROPAGATE_EXCEPTIONS"] = False
    register_error_handlers(app)
    return app


def _raise_on(error_app, path, exc):
    @error_app.route(path)
    def _probe():
        raise exc

    return error_app.test_client().get(path)


# --------------------------------------------------------------------------
# WarehouseListParams.uuid must stay a plain string
# --------------------------------------------------------------------------

def test_warehouse_list_uuid_is_a_string_not_a_uuid_object():
    """A UUID here binds as ::uuid and Postgres refuses varchar = uuid."""
    value = "0f1f4b1e-1111-2222-3333-444455556666"
    params = WarehouseListParams(uuid=value)
    assert params.uuid == value
    assert isinstance(params.uuid, str)
    assert not isinstance(params.uuid, UUID)


def test_warehouse_list_uuid_accepts_a_non_uuid_string():
    """The column is varchar, so a non-uuid is a miss, not a validation error."""
    params = WarehouseListParams(uuid="notauuid")
    assert params.uuid == "notauuid"


def test_warehouse_list_params_still_forbids_unknown_params():
    with pytest.raises(ValidationError):
        WarehouseListParams(bogus_param="1")


def test_warehouse_list_params_per_page_ceiling_is_100():
    assert WarehouseListParams(per_page=100).per_page == 100
    with pytest.raises(ValidationError):
        WarehouseListParams(per_page=101)


# --------------------------------------------------------------------------
# purchase_order_item currency/unit are NOT NULL, so the DTO requires them
# --------------------------------------------------------------------------

def _po_item(**overrides):
    payload = {
        "material_uuid": "m-1",
        "quantity": 7,
        "price_per_unit": 3.0,
        "currency": "USD",
        "unit": "kg",
    }
    payload.update(overrides)
    return payload


def test_po_item_create_accepts_a_complete_payload():
    item = PurchaseOrderItemCreate(**_po_item())
    assert item.currency.value == "USD"
    assert item.unit.value == "kg"


@pytest.mark.parametrize("missing", ["currency", "unit"])
def test_po_item_create_accepts_a_missing_derived_field(missing):
    """These two are DERIVED, so they belong in the "deliberately optional"
    group described above, not the tightened one.

    Requiring them here looked like the same fix as WarehouseListParams.uuid,
    but it broke the only way the UI creates a purchase order: POST
    /purchase-order/with-items posts items with no currency — correctly, since
    the order's is authoritative — so every creation 422'd on a field the
    server was about to overwrite. The guarantee that nothing NULL reaches the
    column now lives in PurchaseOrderItemDomain.resolve_currency_and_unit,
    which runs on every create path (see
    tests/domains/test_purchase_order_item_derivation.py).
    """
    payload = _po_item()
    payload.pop(missing)
    item = PurchaseOrderItemCreate(**payload)      # must not raise
    assert getattr(item, missing) is None


def test_po_item_create_accepts_both_derived_fields_missing():
    """The exact item shape the web form posts."""
    payload = _po_item()
    del payload["currency"], payload["unit"]
    item = PurchaseOrderItemCreate(**payload)
    assert item.currency is None and item.unit is None


def test_po_item_purchase_order_uuid_stays_optional():
    """Deliberately optional: a PO can be created with its items nested."""
    item = PurchaseOrderItemCreate(**_po_item())
    assert item.purchase_order_uuid is None


# --------------------------------------------------------------------------
# The IntegrityError handler must separate "you are missing a field" from
# "you collided with an existing row"
# --------------------------------------------------------------------------

NOT_NULL_DETAIL = (
    'null value in column "currency" of relation "purchase_order_item" '
    "violates not-null constraint"
)


def test_not_null_column_is_extracted_from_the_postgres_message():
    assert _not_null_column(NOT_NULL_DETAIL) == "currency"


def test_not_null_column_is_none_when_the_message_has_no_column():
    assert _not_null_column("some other integrity problem") is None
    assert _not_null_column("") is None

def test_not_null_violation_answers_422_naming_the_column(error_app):
    res = _raise_on(error_app, "/p1", _integrity(NOT_NULL_DETAIL, NotNullViolation))
    assert res.status_code == 422, res.get_json()
    body = res.get_json()
    assert body["error"] == "'currency' is required"
    assert body["detail"] == "not_null_violation"


def test_not_null_violation_is_detected_by_message_without_psycopg2_class(error_app):
    """The driver class is the strong signal; the message is the fallback."""
    res = _raise_on(error_app, "/p2", _integrity(NOT_NULL_DETAIL))
    assert res.status_code == 422
    assert res.get_json()["error"] == "'currency' is required"


def test_not_null_without_a_named_column_still_avoids_409(error_app):
    res = _raise_on(
        error_app, "/p3", _integrity("violates not-null constraint", NotNullViolation)
    )
    assert res.status_code == 422
    assert res.get_json()["error"] == "A required field was missing"


def test_a_real_uniqueness_conflict_is_still_409(error_app):
    res = _raise_on(
        error_app,
        "/p4",
        _integrity(
            'duplicate key value violates unique constraint "some_uq"', UniqueViolation
        ),
    )
    assert res.status_code == 409, res.get_json()
    assert res.get_json()["error"] == "Conflicts with an existing record"


def test_the_internal_account_conflict_keeps_its_specific_message(error_app):
    res = _raise_on(
        error_app,
        "/p5",
        _integrity(
            'duplicate key value violates unique constraint '
            '"uq_financial_account_internal_currency"',
            UniqueViolation,
        ),
    )
    assert res.status_code == 409
    assert "Only one is allowed per currency" in res.get_json()["error"]
