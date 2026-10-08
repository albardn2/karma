import math
from typing import List, Tuple
from shapely.geometry import MultiPoint, Point
from shapely.wkb import loads as to_shape  # adjust if you actually use to_shape from shapely.ops
import os

import requests
from models.common import Customer
from app.utils.geom_utils import wkt_or_wkb_to_shape


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0088
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2)
    return 2 * R * math.asin(math.sqrt(a))

class OSRMRoutingError(RuntimeError):
    pass

class SalesmanRouterMixin:
    """
    Mixin that provides a simplified TSP-ish path using OSRM.
    Assumes each `Customer` has a `.coordinates` geometry (lon/lat WGS84).
    """

    # The PUBLIC OSRM demo server, called synchronously from inside a request.
    # Point OSRM_BASE_URL at a self-hosted instance and this stops being a
    # third party's rate limit on your API.
    OSRM_BASE = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")

    # Road geometry for the drawn polyline is a NICE-TO-HAVE: when a leg is
    # not fetched the path falls back to a straight segment, which the map
    # already renders. It is not worth holding a worker — and, because the
    # caller passes its open UnitOfWork down, a Postgres transaction — on a
    # free public server.
    #
    # THESE NUMBERS ARE SIZED TO FIT INSIDE idle_in_transaction_session_timeout,
    # which docker-compose.prod.yaml sets to 60s for the web service. The
    # routing path holds a transaction open across every one of these calls,
    # so if the worst case exceeded that, Postgres would terminate the
    # connection mid-route and a degraded OSRM would turn into a hard failure
    # instead of a rougher polyline. Worst case here:
    #
    #     20 legs x 2s  +  8s table  =  48s   <  60s
    #
    # Measured against router.project-osrm.org: a leg answers in 0.39-0.77s,
    # so a 2s cap is ~2.5x the slowest observed and only bites when that
    # server is actually struggling — which is exactly when the leash
    # matters. Change either constant and re-check the arithmetic above.
    LEG_TIMEOUT_SECONDS = 2
    TABLE_TIMEOUT_SECONDS = 8
    MAX_ROUTED_LEGS = 20

    def _osrm_table(self, coords: List[Tuple[float, float]]) -> List[List[float]]:
        """
        Returns an all-to-all duration matrix (seconds) using OSRM /table.
        coords: list of (lon, lat)
        """
        coord_str = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coords)
        url = f"{self.OSRM_BASE}/table/v1/driving/{coord_str}"
        params = {
            "annotations": "duration"
        }
        r = requests.get(url, params=params, timeout=self.TABLE_TIMEOUT_SECONDS)
        if r.status_code != 200:
            raise OSRMRoutingError(f"OSRM table error: HTTP {r.status_code} - {r.text[:200]}")
        data = r.json()
        if data.get("code") != "Ok":
            raise OSRMRoutingError(f"OSRM table returned non-Ok code: {data.get('code')}")
        return data["durations"]  # NxN matrix (seconds)

    def _osrm_route_coords(self, a: Tuple[float, float], b: Tuple[float, float]) -> List[Tuple[float, float]]:
        """
        Returns a list of (lat, lon) coordinates for the route polyline between a and b using OSRM /route (geojson geometry).
        a,b are (lon,lat).
        """
        url = f"{self.OSRM_BASE}/route/v1/driving/{a[0]:.6f},{a[1]:.6f};{b[0]:.6f},{b[1]:.6f}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "false",
            "alternatives": "false"
        }
        r = requests.get(url, params=params, timeout=self.LEG_TIMEOUT_SECONDS)
        if r.status_code != 200:
            raise OSRMRoutingError(f"OSRM route error: HTTP {r.status_code} - {r.text[:200]}")
        data = r.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            raise OSRMRoutingError(f"OSRM route returned non-Ok code or empty routes: {data.get('code')}")
        # GeoJSON coords are [lon, lat]; convert to (lat, lon)
        coords = data["routes"][0]["geometry"]["coordinates"]
        return [(lat, lon) for lon, lat in coords]

    def run(
            self,
            customers: List[Customer],
            start_pt: Point,  # in lon/lat WGS84
            end_pt: Point,    # in lon/lat WGS84
    ) -> tuple[list[Customer], list[tuple[float, float]], list[tuple[float, float]]]:
        """
        Simplified implementation using OSRM:
          1) Build a duration matrix via OSRM /table for [start, all customers, end].
          2) Greedy nearest-neighbor from start visiting all customers; end is fixed.
          3) Fetch real road polylines via OSRM /route per leg and stitch.
        Returns:
          - ordered_customers: customers in visit order
          - waypoints: [(lat,lon)] from start through customers to end
          - route_coords_ll: full stitched polyline [(lat,lon)]
        """
        # Gather lon/lat pairs
        def pt_lonlat(p: Point) -> Tuple[float, float]:
            return (float(p.x), float(p.y))

        start_ll = pt_lonlat(start_pt)
        end_ll   = pt_lonlat(end_pt)

        cust_ll: List[Tuple[float, float]] = []
        for c in customers:
            shp = wkt_or_wkb_to_shape(c.coordinates)  # should yield a Point
            cust_ll.append((float(shp.x), float(shp.y)))

        # Build the combined coordinate list: [start, customers..., end]
        all_coords = [start_ll, *cust_ll, end_ll]

        # Try OSRM table; on failure, fallback to haversine matrix
        try:
            durations = self._osrm_table(all_coords)  # seconds
        except Exception:
            # Fallback: approximate with haversine in seconds at 40 km/h avg (adjust if needed)
            avg_kmh = 40.0
            sec_per_km = 3600.0 / avg_kmh
            N = len(all_coords)
            durations = [[0.0] * N for _ in range(N)]
            for i in range(N):
                li, bi = all_coords[i][1], all_coords[i][0]
                for j in range(N):
                    if i == j:
                        continue
                    lj, bj = all_coords[j][1], all_coords[j][0]
                    km = _haversine_km(li, bi, lj, bj)
                    durations[i][j] = km * sec_per_km

        n_customers = len(customers)
        start_idx = 0
        end_idx = len(all_coords) - 1
        customer_indices = list(range(1, 1 + n_customers))  # indices in all_coords

        # Nearest-neighbor tour from start, visiting all customers; end fixed last
        route_indices = [start_idx]
        remaining = set(customer_indices)
        while remaining:
            last = route_indices[-1]
            nxt = min(remaining, key=lambda j: durations[last][j] if durations[last][j] is not None else float("inf"))
            route_indices.append(nxt)
            remaining.remove(nxt)
        route_indices.append(end_idx)

        # Map route indices to ordered customers (skip start and end)
        idx_to_customer = {i + 1: c for i, c in enumerate(customers)}
        ordered_customers = [idx_to_customer[i] for i in route_indices if i in idx_to_customer]

        # Build waypoints (lat, lon) in the requested format
        def lonlat_to_latlon(ll):  # (lon,lat) -> (lat,lon)
            return (ll[1], ll[0])

        waypoints = [lonlat_to_latlon(all_coords[i]) for i in route_indices]

        # Fetch and stitch the polyline for each leg using OSRM /route
        route_coords_ll: List[Tuple[float, float]] = []
        legs = list(zip(route_indices[:-1], route_indices[1:]))
        for leg_number, (a, b) in enumerate(legs):
            # Past the cap, stop asking and draw straight lines. The worst
            # case is now MAX_ROUTED_LEGS x LEG_TIMEOUT_SECONDS rather than
            # unbounded, and a trip with more stops than that degrades to a
            # rougher polyline instead of a frozen API.
            if leg_number >= self.MAX_ROUTED_LEGS:
                leg_coords = [lonlat_to_latlon(all_coords[a]), lonlat_to_latlon(all_coords[b])]
            else:
                try:
                    leg_coords = self._osrm_route_coords(all_coords[a], all_coords[b])
                except Exception:
                    # Fallback to a straight segment if OSRM routing fails
                    leg_coords = [lonlat_to_latlon(all_coords[a]), lonlat_to_latlon(all_coords[b])]
            if route_coords_ll and leg_coords:
                # avoid duplicating the connecting point
                if leg_coords[0] == route_coords_ll[-1]:
                    leg_coords = leg_coords[1:]
            route_coords_ll.extend(leg_coords)

        return ordered_customers, waypoints, route_coords_ll
