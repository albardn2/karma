"""The customer list's field filters, shared by GET /customer/ and the map.

Two properties: the user's text is matched literally (an unescaped "_" or "%"
is a LIKE wildcard, so typing "_" listed every customer), and the map is driven
by exactly the same filters as the list, so a filtered list and its map agree.
"""
from types import SimpleNamespace

from sqlalchemy.dialects import postgresql

from app.dto.customer import CustomerCategory, CustomerListParams, CustomerMapClusterParams
from app.entrypoint.routes.customer.routes import customer_field_filters


def _sql(clauses):
    """Each clause as (sql text, bound values) — the values are what the user's
    text became, before any dialect quoting."""
    out = []
    for c in clauses:
        compiled = c.compile(dialect=postgresql.dialect())
        out.append((str(compiled), list(compiled.params.values())))
    return out


def test_wildcards_in_the_users_text_are_literal():
    ((sql, values),) = _sql(customer_field_filters(SimpleNamespace(full_name="a_b%c")))
    assert values == ["%a\\_b\\%c%"]
    assert "ESCAPE" in sql


def test_every_text_field_is_a_case_insensitive_contains():
    sql = _sql(customer_field_filters(SimpleNamespace(
        email_address="x@y", company_name="Shop", full_name="Ali", phone_number="0999",
    )))
    assert len(sql) == 4
    assert all("ILIKE" in s for s, _ in sql)
    assert ("customer.email_address" in sql[0][0], sql[0][1]) == (True, ["%x@y%"])
    assert ("customer.phone_number" in sql[3][0], sql[3][1]) == (True, ["%0999%"])


def test_search_matches_name_company_or_phone():
    ((sql, values),) = _sql(customer_field_filters(SimpleNamespace(search="  kafe  ")))
    assert " OR " in sql
    for column in ("customer.full_name", "customer.company_name", "customer.phone_number"):
        assert column in sql
    assert values == ["%kafe%"] * 3  # trimmed


def test_blank_fields_add_nothing():
    assert customer_field_filters(SimpleNamespace(full_name="   ", search="")) == []


def test_category_and_uuid_are_exact():
    (uuid_sql, uuid_values), (cat_sql, cat_values) = _sql(
        customer_field_filters(SimpleNamespace(uuid="u-1", category=CustomerCategory.DISTRIBUTER))
    )
    assert "customer.uuid =" in uuid_sql and uuid_values == ["u-1"]
    assert "customer.category =" in cat_sql and cat_values == ["distributer"]


def test_the_map_accepts_every_filter_the_list_does():
    """The app sends the list's filters to the map unchanged; a field the map
    params lacked would 400 (extra='forbid') or be dropped."""
    list_fields = {"uuid", "category", "email_address", "company_name", "full_name", "phone_number", "search"}
    assert list_fields <= set(CustomerListParams.model_fields)
    assert list_fields <= set(CustomerMapClusterParams.model_fields)
    map_params = CustomerMapClusterParams(
        within_polygon="POLYGON((0 0,0 1,1 1,1 0,0 0))", category="minimarket", search="x",
    )
    list_params = CustomerListParams(category="minimarket", search="x")
    assert _sql(customer_field_filters(map_params)) == _sql(customer_field_filters(list_params))
