"""What may still be edited on a material that is already in use.

Unit, sku and type are frozen once a material has stock, pricing, orders or
history — changing them would silently restate what those records mean. Name
and description stay editable forever.

The distinction that matters is CHANGED versus MENTIONED. The web form posts
the whole material on every save, so a guard keyed on "is this field present
in the payload" rejected renaming or describing any material that had ever
been stocked — which is nearly all of them, making the detail page's edit
button look broken.
"""
from datetime import datetime

import pytest

from app.domains.material.domain import MaterialDomain
from app.dto.material import MaterialUpdate
from app.entrypoint.routes.common.errors import BadRequestError
from models.common import Material as MaterialModel


def make_material(**overrides):
    m = MaterialModel(
        uuid=overrides.get("uuid", "mat-1"),
        name=overrides.get("name", "Peanuts"),
        sku=overrides.get("sku", "PNT-1"),
        type=overrides.get("type", "raw_material"),
        measure_unit=overrides.get("measure_unit", "kg"),
        description=overrides.get("description", None),
    )
    # Column defaults only fire on flush against a real DB, and these tests
    # never flush; MaterialRead requires a real datetime
    object.__setattr__(m, "is_deleted", False)
    object.__setattr__(m, "created_at", datetime(2026, 7, 1, 12, 0, 0))
    return m


class _Repo:
    """A repository whose find_first answers whether a relation exists."""

    def __init__(self, material=None, has_relation=False):
        self._material = material
        self._has_relation = has_relation
        self.saved = None

    def find_one(self, **_kwargs):
        return self._material

    def find_first(self, **_kwargs):
        return object() if self._has_relation else None

    def save(self, model, commit=False):
        self.saved = model


class _Session:
    """Stands in for the raw query the sku-uniqueness check makes."""

    def __init__(self, clash=None):
        self._clash = clash

    def query(self, _model):
        return self

    def filter(self, *_args):
        return self

    def first(self):
        return self._clash


class _Uow:
    """Every relation repository reports the same answer, which is enough:
    the guard only asks 'is this material referenced anywhere'."""

    def __init__(self, material, in_use, sku_clash=None):
        self.material_repository = _Repo(material)
        self.session = _Session(sku_clash)
        for name in (
            "pricing_repository", "customer_order_item_repository",
            "inventory_repository", "purchase_order_item_repository",
            "fixed_asset_repository", "inventory_event_repository",
        ):
            setattr(self, name, _Repo(has_relation=in_use))


def _update(material, in_use, sku_clash=None, **fields):
    uow = _Uow(material, in_use, sku_clash)
    dto = MaterialDomain.update_material(
        uow=uow, uuid=material.uuid, payload=MaterialUpdate(**fields)
    )
    return uow, dto


# --- a material that is already in use --------------------------------------


def test_the_whole_material_can_be_reposted_when_nothing_sensitive_changed():
    """The regression: this is exactly what the detail page's Save sends."""
    m = make_material()
    uow, dto = _update(
        m, in_use=True,
        name="Peanuts (renamed)", description="now with a description",
        sku="PNT-1", type="raw_material", measure_unit="kg",   # unchanged
    )
    assert dto.name == "Peanuts (renamed)"
    assert dto.description == "now with a description"
    assert uow.material_repository.saved is m


def test_renaming_an_in_use_material_is_allowed():
    m = make_material()
    _, dto = _update(m, in_use=True, name="Roasted peanuts")
    assert dto.name == "Roasted peanuts"


def test_changing_the_unit_of_an_in_use_material_is_refused():
    m = make_material()
    with pytest.raises(BadRequestError, match="measure_unit"):
        _update(m, in_use=True, measure_unit="liters")


def test_the_sku_of_an_in_use_material_CAN_be_changed():
    """A sku is a label, not a unit of account: nothing stores a copy, and
    every report joins on material_uuid and reads the current value — so
    correcting a mistyped code re-labels history rather than misstating it."""
    m = make_material()
    _, dto = _update(m, in_use=True, sku="PNT-CORRECTED")
    assert dto.sku == "PNT-CORRECTED"


def test_sku_and_name_can_be_changed_together_on_an_in_use_material():
    m = make_material()
    _, dto = _update(m, in_use=True, name="Roasted peanuts", sku="RPNT-1")
    assert (dto.name, dto.sku) == ("Roasted peanuts", "RPNT-1")


def test_a_sku_already_taken_is_refused_cleanly():
    """The column is globally unique, so without this the collision would
    surface as an IntegrityError 500 at commit."""
    m = make_material()
    with pytest.raises(BadRequestError, match="already used"):
        _update(m, in_use=True, sku="TAKEN-1", sku_clash=object())


def test_reposting_the_same_sku_is_not_treated_as_a_collision():
    """The form sends sku on every save; matching itself must not trip the
    uniqueness check (the query excludes the row being edited, but the
    equality short-circuit means it is never even run)."""
    m = make_material()
    _, dto = _update(m, in_use=True, name="Renamed", sku=m.sku, sku_clash=object())
    assert dto.name == "Renamed"


def test_changing_the_type_of_an_in_use_material_is_refused():
    m = make_material()
    with pytest.raises(BadRequestError, match="type"):
        _update(m, in_use=True, type="product")


def test_the_refusal_names_every_offending_field():
    m = make_material()
    with pytest.raises(BadRequestError) as exc:
        _update(m, in_use=True, type="product", measure_unit="liters", name="fine")
    message = str(exc.value)
    assert "type" in message and "measure_unit" in message


def test_a_refused_change_leaves_the_material_untouched():
    m = make_material()
    uow = _Uow(m, True)
    with pytest.raises(BadRequestError):
        MaterialDomain.update_material(
            uow=uow, uuid=m.uuid, payload=MaterialUpdate(measure_unit="liters", name="new"),
        )
    assert m.measure_unit == "kg"
    assert m.name == "Peanuts"
    assert uow.material_repository.saved is None


# --- a material nothing references yet --------------------------------------


def test_an_unused_material_may_change_anything():
    m = make_material()
    _, dto = _update(
        m, in_use=False,
        name="Cashews", sku="CSH-1", type="product", measure_unit="liters",
    )
    assert (dto.sku, dto.type.value, dto.measure_unit.value) == ("CSH-1", "product", "liters")
