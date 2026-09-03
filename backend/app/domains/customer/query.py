"""Evaluates the customer map's query toolbar (dto/customer_query).

The pool is mappable customers only — the results draw as pins. Rows become
sets of customer uuids and combine with SQL precedence: consecutive AND rows
intersect into a group, OR starts a new group, and the groups union. Tag and
category rows reuse the routing strategies' matchers so "has this tag" means
the same thing in both builders; debt reuses the same set-based balance
computation; service-area containment runs in PostGIS.
"""
from typing import List

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.trip.priority_router import (
    _norm,
    category_filter_matches,
    tag_filter_matches,
)
from app.dto.customer_query import CustomerQuery, QueryConnector, QueryField, QueryRow
from app.dto.routing_strategy import CategoryFilterOp, TagFilterOp
from app.entrypoint.routes.common.errors import BadRequestError

# money equality is a rounding question, not a bit-for-bit one — the same
# tolerance the invoices use for "paid in full"
_DEBT_EPSILON = 0.005


def _name_matches(customer, op: str, value) -> bool:
    """One row matches BOTH spellings of identity: a customer is found whether
    the dispatcher remembers the person or the shop."""
    names = [n for n in (_norm(customer.full_name or ""), _norm(customer.company_name or "")) if n]
    if op == "EQUAL":
        return _norm(value) in names
    if op == "NOT_EQUAL":
        return _norm(value) not in names
    if op == "IS_IN":
        wanted = {_norm(v) for v in value}
        return any(n in wanted for n in names)
    if op == "CONTAINS":
        needle = _norm(value)
        return any(needle in n for n in names)
    raise BadRequestError(f"Unknown name op '{op}'")


def _uuid_matches(customer, op: str, value) -> bool:
    current = _norm(customer.uuid)
    if op == "EQUAL":
        return current == _norm(value)
    if op == "NOT_EQUAL":
        return current != _norm(value)
    if op == "IS_IN":
        return current in {_norm(v) for v in value}
    raise BadRequestError(f"Unknown uuid op '{op}'")


def _resolve_service_area(uow: SqlAlchemyUnitOfWork, ref: str):
    """A row's area value may be the uuid (what the toolbar's picker sends) or
    a typed name; names match case-insensitively like everywhere else."""
    area = uow.service_area_repository.find_one(uuid=ref, is_deleted=False)
    if area:
        return area
    for candidate in uow.service_area_repository.find_all(is_deleted=False):
        if _norm(candidate.name) == _norm(ref):
            return candidate
    raise BadRequestError(f"Unknown service area '{ref}'")


def run_customer_query(uow: SqlAlchemyUnitOfWork, query: CustomerQuery) -> List:
    pool = uow.customer_repository.fetch_mappable_customers()
    by_uuid = {c.uuid: c for c in pool}
    all_uuids = set(by_uuid)

    # shared lookups, each computed once however many rows need it
    balances = {
        currency: uow.customer_repository.fetch_outstanding_balances(
            customer_uuids=list(all_uuids), currency=currency
        )
        for currency in {
            row.currency.value for row in query.rows if row.field == QueryField.DEBT
        }
    }
    area_members: dict = {}
    for row in query.rows:
        if row.field != QueryField.SERVICE_AREA:
            continue
        for ref in row.value if isinstance(row.value, list) else [row.value]:
            if ref not in area_members:
                area = _resolve_service_area(uow, ref)
                area_members[ref] = set(
                    uow.customer_repository.fetch_uuids_within_geometry(area.geometry)
                )

    def row_set(row: QueryRow) -> set:
        if row.field == QueryField.TAGS:
            op = TagFilterOp(row.op)
            return {u for u, c in by_uuid.items() if tag_filter_matches(c.tags, op, row.value)}
        if row.field == QueryField.CATEGORY:
            op = CategoryFilterOp(row.op)
            return {u for u, c in by_uuid.items() if category_filter_matches(c.category, op, row.value)}
        if row.field == QueryField.NAME:
            return {u for u, c in by_uuid.items() if _name_matches(c, row.op, row.value)}
        if row.field == QueryField.UUID:
            return {u for u, c in by_uuid.items() if _uuid_matches(c, row.op, row.value)}
        if row.field == QueryField.DEBT:
            per_customer = balances[row.currency.value]
            out = set()
            for u in all_uuids:
                debt = float(per_customer.get(u, 0) or 0)
                if row.op == "LARGER_THAN" and debt > row.amount:
                    out.add(u)
                elif row.op == "SMALLER_THAN" and debt < row.amount:
                    out.add(u)
                elif row.op == "EQUAL" and abs(debt - row.amount) < _DEBT_EPSILON:
                    out.add(u)
            return out
        if row.field == QueryField.SERVICE_AREA:
            refs = row.value if isinstance(row.value, list) else [row.value]
            inside = set().union(*(area_members[r] for r in refs)) & all_uuids
            # EQUAL and IS_IN both mean "inside" (one area vs any of several);
            # NOT_EQUAL means "outside it"
            return all_uuids - inside if row.op == "NOT_EQUAL" else inside
        raise BadRequestError(f"Unknown query field '{row.field}'")

    # AND binds tighter than OR: intersect within a group, union the groups
    groups: List[set] = []
    current: set = set()
    for i, row in enumerate(query.rows):
        matched = row_set(row)
        if i == 0:
            current = matched
        elif row.connector == QueryConnector.OR:
            groups.append(current)
            current = matched
        else:
            current &= matched
    groups.append(current)

    result = set().union(*groups)
    return sorted(
        (by_uuid[u] for u in result),
        key=lambda c: (_norm(c.company_name or ""), c.uuid),
    )
