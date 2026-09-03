"""The map query toolbar's evaluator: fields, operators, and AND/OR precedence.

The one rule worth pinning hard is precedence: AND binds tighter than OR, so
X AND Y OR Z is (X AND Y) OR Z. A flat left-to-right fold would silently give
X AND (Y OR Z) and the dispatcher would never know their query lied.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.domains.customer.query import run_customer_query
from app.dto.customer_query import CustomerQuery
from app.entrypoint.routes.common.errors import BadRequestError


def _customer(uuid, company="Shop", name="Person", category="cafe", tags=()):
    return SimpleNamespace(
        uuid=uuid, company_name=company, full_name=name,
        category=category, tags=list(tags),
    )


def _uow(pool, balances=None, areas=None, area_members=None):
    """areas: {ref: area}; area_members: {area_uuid: [customer uuids inside]}"""
    uow = MagicMock()
    uow.customer_repository.fetch_mappable_customers.return_value = pool
    uow.customer_repository.fetch_outstanding_balances.side_effect = (
        lambda customer_uuids, currency: (balances or {}).get(currency, {})
    )
    areas = areas or {}
    uow.service_area_repository.find_one.side_effect = (
        lambda **kw: areas.get(kw.get("uuid"))
    )
    uow.service_area_repository.find_all.side_effect = lambda **kw: list(areas.values())
    uow.customer_repository.fetch_uuids_within_geometry.side_effect = (
        lambda geometry: (area_members or {}).get(geometry, [])
    )
    return uow


def _run(uow, rows):
    return [c.uuid for c in run_customer_query(uow, CustomerQuery(rows=rows))]


POOL = [
    _customer("c1", company="Aleppo Nuts", category="roastery", tags=["vip"]),
    _customer("c2", company="Damas Cafe", category="cafe", tags=["region:malki"]),
    _customer("c3", company="Mazzeh Sweets", category="cafe", tags=["vip", "region:malki"]),
]


def test_and_binds_tighter_than_or():
    """category=cafe AND tag=vip OR company=Aleppo Nuts → (c3) ∪ (c1), NOT
    cafe AND (vip OR aleppo) which would drop c1."""
    rows = [
        {"field": "category", "op": "EQUAL", "value": "cafe"},
        {"field": "tags", "op": "EQUAL", "value": "vip", "connector": "AND"},
        {"field": "name", "op": "EQUAL", "value": "Aleppo Nuts", "connector": "OR"},
    ]
    assert _run(_uow(POOL), rows) == ["c1", "c3"]


def test_name_matches_either_spelling_of_identity():
    pool = [_customer("c1", company="Aleppo Nuts", name="Abu Karim")]
    assert _run(_uow(pool), [{"field": "name", "op": "EQUAL", "value": "abu karim"}]) == ["c1"]
    assert _run(_uow(pool), [{"field": "name", "op": "CONTAINS", "value": "nuts"}]) == ["c1"]
    assert _run(_uow(pool), [{"field": "name", "op": "NOT_EQUAL", "value": "Aleppo Nuts"}]) == []


def test_uuid_is_in():
    rows = [{"field": "uuid", "op": "IS_IN", "value": "c1, c3"}]
    assert _run(_uow(POOL), rows) == ["c1", "c3"]


def test_debt_operators_and_equal_tolerance():
    balances = {"SYP": {"c1": 150.0, "c2": 49.999, "c3": 50.0}}
    uow = _uow(POOL, balances=balances)
    assert _run(uow, [{"field": "debt", "op": "LARGER_THAN", "amount": 100}]) == ["c1"]
    assert _run(uow, [{"field": "debt", "op": "SMALLER_THAN", "amount": 50}]) == ["c2"]
    # money equality is a rounding question: 49.999 counts as 50
    assert _run(uow, [{"field": "debt", "op": "EQUAL", "amount": 50}]) == ["c2", "c3"]


def test_service_area_inside_outside_and_any_of():
    area_a = SimpleNamespace(uuid="a1", name="Malki", geometry="geom-a")
    area_b = SimpleNamespace(uuid="a2", name="Mazzeh", geometry="geom-b")
    uow = _uow(
        POOL,
        areas={"a1": area_a, "a2": area_b},
        area_members={"geom-a": ["c2"], "geom-b": ["c3"]},
    )
    assert _run(uow, [{"field": "service_area", "op": "EQUAL", "value": "a1"}]) == ["c2"]
    assert _run(uow, [{"field": "service_area", "op": "NOT_EQUAL", "value": "a1"}]) == ["c1", "c3"]
    assert _run(uow, [{"field": "service_area", "op": "IS_IN", "value": ["a1", "a2"]}]) == ["c2", "c3"]


def test_unknown_service_area_is_refused_not_empty():
    with pytest.raises(BadRequestError):
        _run(_uow(POOL), [{"field": "service_area", "op": "EQUAL", "value": "nowhere"}])


def test_ops_are_validated_per_field():
    with pytest.raises(Exception):  # pydantic ValidationError
        CustomerQuery(rows=[{"field": "tags", "op": "CONTAINS", "value": "vip"}])
    with pytest.raises(Exception):
        CustomerQuery(rows=[{"field": "debt", "op": "IS_IN", "value": "5"}])


def test_a_missing_value_is_refused_not_stringified():
    """value is Optional only for DEBT rows. Anywhere else a null value must
    422 — _clean_values would otherwise turn None into the matchable literal
    "None", and {"field":"name","op":"NOT_EQUAL"} would silently return
    every customer."""
    with pytest.raises(Exception):
        CustomerQuery(rows=[{"field": "name", "op": "NOT_EQUAL"}])
    with pytest.raises(Exception):
        CustomerQuery(rows=[{"field": "tags", "op": "EQUAL", "value": None}])


def test_the_query_endpoint_checks_as_a_read_not_a_create():
    """POST /customer/query only reads, but the ACL chokepoint maps POST to
    'create' — which would lock out every read-only role (accountant can LIST
    customers but could not QUERY them). The endpoint must be in the
    read-shaped set, and the chokepoint must consult it for BOTH gates (the
    tenant feature cap and the per-user grant)."""
    import inspect

    import app as app_pkg
    from app.entrypoint.routes.common.permissions import READ_SHAPED_POST_ENDPOINTS

    assert "customer.query_customers" in READ_SHAPED_POST_ENDPOINTS
    src = inspect.getsource(app_pkg)
    marker = "READ_SHAPED_POST_ENDPOINTS else request.method"
    assert marker in src
    block = src.split(marker, 1)[1]
    # both gates run on the effective method — a raw request.method in either
    # endpoint_allowed call would re-open the 403
    gates = block.split("missing endpoint permission")[0]
    assert gates.count("effective_method") == 2
    assert "endpoint_allowed(\n            g.account_perms, request.blueprint, request.method" not in src


def test_typed_tag_value_converges_like_the_strategy_builder():
    """A retyped catalog label must land on the machine tag the same way the
    routing-strategy builder converges it — same canonicalizer, same result."""
    from app.dto.routing_strategy import canonical_tag_value

    row = CustomerQuery(rows=[{"field": "tags", "op": "EQUAL", "value": " VIP "}]).rows[0]
    assert row.value == canonical_tag_value("VIP")
