"""Re-sorting a trip's remaining stops around where the driver actually is.

The plan a trip starts with goes stale the moment the day does: the driver
leaves from somewhere other than the depot, a stop gets skipped, traffic
reshuffles what is close. This module reorders the stops that have NOT been
worked yet so the nearest one comes next, and draws the road path through them.

Two things make this more than a sort:

  1. ORDER IS ENFORCED BY THE CHAIN, NOT BY `index`. Each stop's task execution
     depends on the previous stop's task NAME, and a not_started execution
     cannot be completed (task_execution domain's completion guard). Both
     clients derive the order they show from that `depends_on` chain and ignore
     `trip_stop.index` almost entirely. So a re-sort has to rewire the chain —
     shuffling indexes alone would change nothing the driver experiences.
  2. COMPLETED WORK IS UNTOUCHABLE. Stops already worked keep their place in
     history; only the pending tail is reordered, and it is re-anchored to
     whatever the trip is currently at.

The ordering itself is pure Python (projected metres, greedy nearest
neighbour) so it is fast and deterministic. The road path is best-effort: it
asks OSRM per leg with a short timeout and falls back to a straight segment,
exactly as the legacy pipeline does, so a slow router degrades the drawing
rather than failing the re-sort.
"""
from datetime import datetime
from typing import List, Optional, Tuple

from app.domains.trip.priority_router import _dist2, _xy, _TO_METERS
from app.dto.task_execution import OperatorType
from app.dto.workflow_execution import WorkflowStatus
from app.entrypoint.routes.common.errors import BadRequestError
from app.utils.geom_utils import wkt_or_wkb_to_shape

# One leg of road geometry is a nice-to-have, so it gets a short leash: the
# legacy mixin waits 20s per leg, which on a 12-stop trip could hold a request
# for minutes. Past the cap the path is simply straight lines.
LEG_TIMEOUT_SECONDS = 6
MAX_ROUTED_LEGS = 25

# statuses of a stop that has not been worked yet — the only ones we reorder
PENDING_STOP_STATUSES = (WorkflowStatus.NOT_STARTED.value, WorkflowStatus.IN_PROGRESS.value)


def _lonlat(stop) -> Optional[Tuple[float, float]]:
    """(lon, lat) of a stop, or None when its geometry is unusable."""
    try:
        shape = wkt_or_wkb_to_shape(stop.coordinates)
    except Exception:
        return None
    return (shape.x, shape.y)


def order_from_anchor(stops: list, anchor_lonlat: Tuple[float, float]) -> list:
    """Greedy nearest-neighbour visit order, starting from `anchor_lonlat`.

    Distances are compared in projected metres (the same transform the priority
    router uses), so this is a real proximity ordering rather than degrees.
    Stops whose coordinates cannot be read keep their relative order at the
    end — they are undrawable but must not vanish from the trip.
    """
    positioned, unpositioned = [], []
    for stop in stops:
        point = _lonlat(stop)
        if point is None:
            unpositioned.append(stop)
        else:
            positioned.append((stop, _TO_METERS.transform(*point)))

    here = _TO_METERS.transform(*anchor_lonlat)
    ordered = []
    remaining = list(positioned)
    while remaining:
        remaining.sort(key=lambda pair: _dist2(pair[1], here))
        stop, here = remaining.pop(0)
        ordered.append(stop)
    return ordered + unpositioned


def _osrm_leg(a: Tuple[float, float], b: Tuple[float, float]) -> List[Tuple[float, float]]:
    """Road geometry for one leg as (lat, lon), or the straight segment."""
    import requests

    from app.domains.trip.saleman_router import SalesmanRouterMixin

    url = (
        f"{SalesmanRouterMixin.OSRM_BASE}/route/v1/driving/"
        f"{a[0]},{a[1]};{b[0]},{b[1]}"
    )
    try:
        response = requests.get(
            url,
            params={"overview": "full", "geometries": "geojson",
                    "steps": "false", "alternatives": "false"},
            timeout=LEG_TIMEOUT_SECONDS,
        )
        payload = response.json()
        coords = payload["routes"][0]["geometry"]["coordinates"]
        return [(lat, lon) for lon, lat in coords]
    except Exception:
        # straight line, same degradation the legacy router accepts
        return [(a[1], a[0]), (b[1], b[0])]


def road_path(points_lonlat: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    """A stitched (lat, lon) polyline through the given points, in order.

    Legs are fetched one by one and joined, dropping a leg's first point when
    it repeats the previous leg's last. Beyond MAX_ROUTED_LEGS the remainder is
    drawn straight so a long trip cannot stall the request.
    """
    if len(points_lonlat) < 2:
        return []
    path: List[Tuple[float, float]] = []
    for i, (a, b) in enumerate(zip(points_lonlat, points_lonlat[1:])):
        leg = _osrm_leg(a, b) if i < MAX_ROUTED_LEGS else [(a[1], a[0]), (b[1], b[0])]
        if path and leg and path[-1] == leg[0]:
            leg = leg[1:]
        path.extend(leg)
    return path


def _dedupe(names: List[str]) -> List[str]:
    seen, out = set(), []
    for name in names or []:
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def resort_pending_stops(uow, workflow_exe, latitude: float, longitude: float) -> dict:
    """Reorder the trip's un-worked stops nearest-first from (lat, lon).

    Rewires the depends_on chain so the driver is genuinely unlocked in the new
    order, renumbers trip_stop.index to match, and returns the new order plus a
    road path from the given position through the stops.
    """
    tasks = list(workflow_exe.task_executions)
    trip_op = next(
        (te for te in tasks if te.operator == OperatorType.TRIP_OPERATOR.value), None
    )
    stop_exes = [te for te in tasks if te.operator == OperatorType.TRIP_STOP_OPERATOR.value]
    pending_exes = [te for te in stop_exes if te.status in PENDING_STOP_STATUSES]
    if not pending_exes:
        raise BadRequestError("This trip has no remaining stops to re-sort")

    trips = workflow_exe.trips
    if not trips:
        raise BadRequestError("This workflow execution has no trip yet")
    trip = trips[0]

    # map task executions to their trip_stop rows (the geometry lives there)
    stop_by_te = {s.task_execution_uuid: s for s in trip.stops if s.task_execution_uuid}
    pending_pairs = [(te, stop_by_te.get(te.uuid)) for te in pending_exes]
    orderable = [(te, s) for te, s in pending_pairs if s is not None]
    if not orderable:
        raise BadRequestError("The remaining stops have no locations to sort by")

    ordered = order_from_anchor([s for _, s in orderable], (longitude, latitude))
    te_by_stop = {s.uuid: te for te, s in orderable}
    ordered_pairs = [(te_by_stop[s.uuid], s) for s in ordered]

    # anchor: whatever the trip is at right now — the last finished chain task,
    # or the trip task itself when no stop has been worked yet
    chain_ops = (OperatorType.TRIP_OPERATOR.value, OperatorType.TRIP_STOP_OPERATOR.value)
    finished = [
        te for te in tasks
        if te.operator in chain_ops and te.status == WorkflowStatus.COMPLETED.value
    ]
    anchor = (
        max(finished, key=lambda te: te.end_time or te.created_at) if finished else trip_op
    )
    anchor_done = anchor is not None and anchor.status == WorkflowStatus.COMPLETED.value

    # re-link the pending tail: anchor -> first -> ... -> last
    previous_name = anchor.name if anchor is not None else None
    for position, (te, _stop) in enumerate(ordered_pairs):
        te.depends_on = _dedupe([previous_name]) if previous_name else []
        if position == 0 and anchor_done:
            if te.status != WorkflowStatus.IN_PROGRESS.value:
                te.status = WorkflowStatus.IN_PROGRESS.value
                te.start_time = datetime.now()
        else:
            # everything behind the front of the queue waits its turn again
            if te.status != WorkflowStatus.NOT_STARTED.value:
                te.status = WorkflowStatus.NOT_STARTED.value
                te.start_time = None
        uow.task_execution_repository.save(model=te, commit=False)
        previous_name = te.name

    # the finish task always closes the chain behind the last stop
    finish_exe = next(
        (te for te in tasks if te.operator == OperatorType.TRIP_FINISH_OPERATOR.value), None
    )
    if finish_exe is not None and previous_name:
        finish_exe.depends_on = [previous_name]
        if finish_exe.status == WorkflowStatus.IN_PROGRESS.value:
            finish_exe.status = WorkflowStatus.NOT_STARTED.value
            finish_exe.start_time = None
        uow.task_execution_repository.save(model=finish_exe, commit=False)

    # keep trip_stop.index agreeing with the chain: worked stops first (their
    # history), then the pending tail in its new order
    worked_count = len([te for te in stop_exes if te.status not in PENDING_STOP_STATUSES])
    for offset, (_te, stop) in enumerate(ordered_pairs):
        stop.index = worked_count + offset
        uow.trip_stop_repository.save(model=stop, commit=False)

    waypoints_lonlat = [(longitude, latitude)]
    for _te, stop in ordered_pairs:
        point = _lonlat(stop)
        if point is not None:
            waypoints_lonlat.append(point)

    return {
        "task_execution_uuids": [te.uuid for te, _ in ordered_pairs],
        "trip_stop_uuids": [s.uuid for _, s in ordered_pairs],
        # (lat, lon) like every other waypoint payload in the system
        "waypoints": [(lat, lon) for lon, lat in waypoints_lonlat],
        "route_coordinates": road_path(waypoints_lonlat),
        "current_task_execution_uuid": ordered_pairs[0][0].uuid if anchor_done else None,
    }
