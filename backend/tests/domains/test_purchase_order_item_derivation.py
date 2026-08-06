"""Where a purchase order item's currency and unit come from.

Neither is the caller's to supply. `currency` belongs to the ORDER — one order,
one currency — and `unit` belongs to the MATERIAL. Both columns are NOT NULL, so
every create path has to fill them before the model is built.

This is the shape of a real outage: the fields were briefly made *required* on
the DTO so that an omitted currency would 422 with a clear name instead of
reaching the database and returning a bogus 409 "Conflicts with an existing
record". But the only way the UI creates a purchase order — POST
/purchase-order/with-items — sends items without a currency, correctly, because
the order's is authoritative. Every purchase order creation in production failed
validation on a field the server was about to overwrite anyway.
"""
import pytest

from app.domains.purchase_order_item.domain import PurchaseOrderItemDomain
from app.dto.purchase_order_item import PurchaseOrderItemCreate
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError


class _Material:
    def __init__(self, measure_unit="kg"):
        self.uuid = "mat-1"
        self.measure_unit = measure_unit


class _Order:
    def __init__(self, currency="SYP"):
        self.uuid = "po-1"
        self.currency = currency


class _Repo:
    def __init__(self, row):
        self._row = row

    def find_one(self, **_kwargs):
        return self._row


class _Uow:
    def __init__(self, material=None, order=None):
        self.material_repository = _Repo(material)
        self.purchase_order_repository = _Repo(order)


def _item(**overrides):
    fields = dict(material_uuid="mat-1", quantity=10, price_per_unit=100.0,
                  purchase_order_uuid="po-1")
    fields.update(overrides)
    return PurchaseOrderItemCreate(**fields)


def _resolve(item, material=_Material(), order=_Order()):
    PurchaseOrderItemDomain.resolve_currency_and_unit(
        uow=_Uow(material, order), item=item
    )
    return item


# --- the regression -------------------------------------------------------


def test_an_item_needs_neither_currency_nor_unit():
    """Exactly what the web form posts. This 422'd in production."""
    item = _item()
    assert item.currency is None and item.unit is None      # accepted by the DTO
    _resolve(item)
    assert item.currency == "SYP"                            # from the order
    assert item.unit == "kg"                                 # from the material


def test_currency_always_comes_from_the_order_even_if_one_is_supplied():
    """One order, one currency: an item disagreeing with its parent would be
    wrong, so the parent wins rather than raising."""
    item = _item(currency="USD")
    _resolve(item, order=_Order(currency="SYP"))
    assert item.currency == "SYP"


def test_a_supplied_unit_that_matches_the_material_is_kept():
    item = _item(unit="kg")
    _resolve(item, material=_Material("kg"))
    assert item.unit == "kg"


def test_a_supplied_unit_that_contradicts_the_material_is_refused():
    with pytest.raises(BadRequestError, match="Invalid unit"):
        _resolve(_item(unit="liters"), material=_Material("kg"))


# --- nothing NULL may reach the columns -----------------------------------


def test_an_unknown_material_is_refused():
    with pytest.raises(NotFoundError, match="Material not found"):
        PurchaseOrderItemDomain.resolve_currency_and_unit(
            uow=_Uow(material=None, order=_Order()), item=_item()
        )


def test_an_item_with_no_order_is_refused_rather_than_written_null():
    """Without a parent there is no currency to derive — the case the DTO's
    required-fields experiment was protecting against. It must still be a clear
    400, not a NOT NULL violation surfacing as a 409 conflict."""
    with pytest.raises(BadRequestError, match="purchase_order_uuid"):
        _resolve(_item(purchase_order_uuid=None))


def test_an_unknown_order_is_refused():
    with pytest.raises(NotFoundError, match="Purchase order not found"):
        PurchaseOrderItemDomain.resolve_currency_and_unit(
            uow=_Uow(material=_Material(), order=None), item=_item()
        )


def test_resolution_leaves_both_columns_populated_for_every_accepted_item():
    """The invariant the NOT NULL columns actually need."""
    for kwargs in ({}, {"unit": "kg"}, {"currency": "USD"}, {"currency": "USD", "unit": "kg"}):
        item = _resolve(_item(**kwargs))
        assert item.currency is not None, kwargs
        assert item.unit is not None, kwargs
