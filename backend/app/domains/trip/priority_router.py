"""Priority-based trip routing (the 2026-08 strategy engine).

A saved RoutingStrategy is an ordered list of priorities; the router walks
them top to bottom until the trip's desired_stops budget is filled:

  1. a priority's filters (tags / category / debt / last-effective-stop age)
     select candidates from the pool — customers in the setup's service areas
     (or all of the tenant's mapped customers when none were picked) that are
     not already on an active trip and not already picked by an earlier
     priority;
  2. from the candidates, the FIRST priority takes the spatially densest
     KMeans cluster (one trip = one tight neighbourhood, same idea as the
     legacy pipeline); every LATER priority takes the candidates nearest to
     what's already picked, so the trip stays compact instead of teleporting
     across town;
  3. each priority contributes at most min(its max_stops, remaining budget)
     stops; running out of candidates is fine — the walk just moves on.

Filters are evaluated in Python, not SQL: the tenant pools are a few hundred
customers, debt has no materialized column anywhere (the dashboards iterate
in Python too — see Customer.balance_per_currency), and pure functions keep
the whole filter engine unit-testable without a database.

Output contract matches TripRouteOperatorSchema: ordered customers plus
(lat, lon) waypoints. route_coordinates stays empty — the web map falls back
to the waypoint polyline, and road-snapped polylines can come later without
touching stored results.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Tuple, Union

from geoalchemy2.shape import to_shape
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon
from sklearn.cluster import KMeans

from app.dto.routing_strategy import (
    CategoryFilterOp,
    DebtFilterOp,
    RoutingStrategyConfig,
    StrategyPriority,
    TagFilterOp,
)
from app.entrypoint.routes.common.errors import BadRequestError

_TO_METERS = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def _norm(value) -> str:
    return str(value).strip().lower()


def tag_filter_matches(tags, op: TagFilterOp, value) -> bool:
    """Tags are stored as 'key' or 'key:value' strings; compare whole tags
    case-insensitively (machine tags are lowercase, typed ones may not be)."""
    normalized = [_norm(t) for t in (tags or [])]
    if op == TagFilterOp.EQUAL:
        return _norm(value) in normalized
    if op == TagFilterOp.NOT_EQUAL:
        return _norm(value) not in normalized
    if op == TagFilterOp.IS_IN:
        wanted = {_norm(v) for v in value}
        return any(t in wanted for t in normalized)
    if op == TagFilterOp.CONTAINS:
        needle = _norm(value)
        return any(needle in t for t in normalized)
    raise BadRequestError(f"Unknown tag filter op '{op}'")


def category_filter_matches(category, op: CategoryFilterOp, value) -> bool:
    current = _norm(category or "")
    if op == CategoryFilterOp.EQUAL:
        return current == _norm(value)
    if op == CategoryFilterOp.NOT_EQUAL:
        return current != _norm(value)
    if op == CategoryFilterOp.IS_IN:
        return current in {_norm(v) for v in value}
    raise BadRequestError(f"Unknown category filter op '{op}'")


def debt_filter_matches(balance_per_currency: dict, op: DebtFilterOp, amount: float, currency: str) -> bool:
    debt = float((balance_per_currency or {}).get(currency, 0) or 0)
    if op == DebtFilterOp.LARGER_THAN:
        return debt > amount
    if op == DebtFilterOp.SMALLER_THAN:
        return debt < amount
    raise BadRequestError(f"Unknown debt filter op '{op}'")


def last_effective_stop_passes(last_effective_stop, days: Optional[int], now: datetime) -> bool:
    """Skip customers effectively visited MORE RECENTLY than `days` days ago.
    Never-visited customers (NULL) always pass — they are exactly who a
    recency filter is meant to surface."""
    if days is None:
        return True
    if last_effective_stop is None:
        return True
    return last_effective_stop <= now - timedelta(days=days)


def customer_matches_priority(customer, priority: StrategyPriority, now: datetime) -> bool:
    for f in priority.tag_filters:
        if not tag_filter_matches(customer.tags, f.op, f.value):
            return False
    if priority.category_filter is not None:
        f = priority.category_filter
        if not category_filter_matches(customer.category, f.op, f.value):
            return False
    if not last_effective_stop_passes(
        customer.last_effective_stop, priority.last_effective_stop_days, now,
    ):
        return False
    if priority.debt_filter is not None:
        # evaluated LAST and only when configured: balance_per_currency walks
        # the customer's invoices in Python (there is no materialized debt
        # column anywhere in the system)
        f = priority.debt_filter
        if not debt_filter_matches(
            customer.balance_per_currency, f.op, f.amount, f.currency.value,
        ):
            return False
    return True


def _xy(customer) -> Tuple[float, float]:
    point = to_shape(customer.coordinates)
    return _TO_METERS.transform(point.x, point.y)


def _centroid(points: List[Tuple[float, float]]) -> Tuple[float, float]:
    n = len(points)
    return (sum(p[0] for p in points) / n, sum(p[1] for p in points) / n)


def _dist2(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def pick_densest_cluster(candidates: list, cap: int) -> list:
    """The legacy pipeline's idea, kept: one trip serves one tight
    neighbourhood. KMeans the candidates into ~n/cap clusters, trim each to
    its cap nearest-to-centroid members, take the best cluster.

    "Best" fills the cap FIRST and breaks ties on tightness (mean squared
    distance): the legacy sum-of-distances score let a tiny two-customer
    cluster beat a full one — a priority asked for max_stops customers and
    got starved by its own densest pair."""
    if len(candidates) <= cap:
        return list(candidates)
    xys = [_xy(c) for c in candidates]
    k = max(1, len(candidates) // cap)
    labels = KMeans(n_clusters=k, random_state=0).fit([list(p) for p in xys]).labels_
    best, best_key = None, None
    for cluster_id in range(k):
        members = [(candidates[i], xys[i]) for i in range(len(candidates)) if labels[i] == cluster_id]
        if not members:
            continue
        center = _centroid([xy for _, xy in members])
        members.sort(key=lambda m: _dist2(m[1], center))
        members = members[:cap]
        center = _centroid([xy for _, xy in members])
        mean_spread = sum(_dist2(xy, center) for _, xy in members) / len(members)
        key = (-len(members), mean_spread)
        if best_key is None or key < best_key:
            best, best_key = members, key
    return [c for c, _ in best]


def pick_nearest(candidates: list, cap: int, anchor: Tuple[float, float]) -> list:
    """Later priorities extend the trip: take the candidates nearest to what
    is already picked, so the route stays compact."""
    ranked = sorted(candidates, key=lambda c: _dist2(_xy(c), anchor))
    return ranked[:cap]


def order_stops(picked: list) -> list:
    """Greedy nearest-neighbour visit order, starting from the customer
    FARTHEST from the picked set's centroid — starting at an edge walks the
    set end to end, where starting in the middle strands the far side for a
    long hop back. Straight-line, like the legacy fallback path — good enough
    until a road router lands."""
    if len(picked) <= 2:
        return list(picked)
    xys = {c.uuid: _xy(c) for c in picked}
    center = _centroid(list(xys.values()))
    remaining = list(picked)
    remaining.sort(key=lambda c: _dist2(xys[c.uuid], center), reverse=True)
    ordered = [remaining.pop(0)]
    while remaining:
        here = xys[ordered[-1].uuid]
        remaining.sort(key=lambda c: _dist2(xys[c.uuid], here))
        ordered.append(remaining.pop(0))
    return ordered


class PriorityRouter:

    def __init__(self, uow):
        self._uow = uow

    def run(
        self,
        config: RoutingStrategyConfig,
        desired_stops: int,
        polygon: Optional[Union[Polygon, MultiPolygon]] = None,
    ) -> Tuple[list, List[Tuple[float, float]]]:
        """Returns (ordered customers, [(lat, lon)] waypoints)."""
        if not desired_stops or desired_stops < 1:
            raise BadRequestError("desired_stops must be at least 1 for a routing strategy")

        pool = self._uow.customer_repository.fetch_priority_routing_pool(polygon=polygon)
        if not pool:
            raise BadRequestError(
                "No customers are available for routing in the selected service areas."
            )

        now = datetime.utcnow()
        picked: list = []
        picked_ids: set = set()
        for priority in config.priorities:
            remaining = desired_stops - len(picked)
            if remaining <= 0:
                break
            cap = min(priority.max_stops or remaining, remaining)
            candidates = [
                c for c in pool
                if c.uuid not in picked_ids and customer_matches_priority(c, priority, now)
            ]
            if not candidates:
                continue
            if picked:
                chosen = pick_nearest(candidates, cap, _centroid([_xy(c) for c in picked]))
            else:
                chosen = pick_densest_cluster(candidates, cap)
            picked.extend(chosen)
            picked_ids.update(c.uuid for c in chosen)

        if not picked:
            raise BadRequestError(
                "No customers matched the strategy's filters. Adjust the "
                "strategy or the service areas and try again."
            )

        ordered = order_stops(picked)
        waypoints = []
        for c in ordered:
            point = to_shape(c.coordinates)
            waypoints.append((point.y, point.x))  # (lat, lon), like the legacy result
        return ordered, waypoints
