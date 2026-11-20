"""Geometry helpers for the assistant (pure Python, no GIS dependency).

Karma stores points as "lat,lon" strings (customers, trip stops, GPS pings) and
service areas as WKT polygons in lon/lat order ("POLYGON ((36.34 33.52, …))").
Areas are city-scale, so planar point-in-polygon on lon/lat is accurate enough.
"""
from __future__ import annotations

import math
import re


def parse_coords(v):
    """'33.49,36.30' | [lat, lon] | {'lat':…, 'lon'|'lng':…} -> (lat, lon) or None."""
    try:
        if isinstance(v, str):
            a, b = v.split(",", 1)
            lat, lon = float(a), float(b)
        elif isinstance(v, (list, tuple)) and len(v) == 2:
            lat, lon = float(v[0]), float(v[1])
        elif isinstance(v, dict):
            lat, lon = float(v["lat"]), float(v.get("lon", v.get("lng")))
        else:
            return None
    except (ValueError, TypeError, KeyError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None
    return lat, lon


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


_RING = re.compile(r"\(([^()]+)\)")


def parse_wkt(wkt: str):
    """POLYGON / MULTIPOLYGON WKT -> list of polygons; a polygon is a list of rings
    (first = outer, rest = holes); a ring is a list of (lon, lat). None if unparseable."""
    if not isinstance(wkt, str):
        return None
    s = wkt.strip()
    m = re.match(r"^(?:SRID=\d+;)?\s*(MULTIPOLYGON|POLYGON)\s*(.*)$", s, re.I | re.S)
    if not m:
        return None
    kind, body = m.group(1).upper(), m.group(2).strip()

    def rings_of(text):
        rings = []
        for r in _RING.findall(text):
            pts = []
            for pair in r.split(","):
                xy = pair.split()
                if len(xy) < 2:
                    continue
                pts.append((float(xy[0]), float(xy[1])))
            if len(pts) >= 3:
                rings.append(pts)
        return rings

    try:
        if kind == "POLYGON":
            rings = rings_of(body)
            return [rings] if rings else None
        # MULTIPOLYGON (((…),(…)), ((…)))
        polys, depth, start = [], 0, None
        for i, ch in enumerate(body):
            if ch == "(":
                depth += 1
                if depth == 2:
                    start = i
            elif ch == ")":
                if depth == 2 and start is not None:
                    rings = rings_of(body[start:i + 1])
                    if rings:
                        polys.append(rings)
                depth -= 1
        return polys or None
    except ValueError:
        return None


def _in_ring(lon: float, lat: float, ring) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi:
            inside = not inside
        j = i
    return inside


class Area:
    """A named polygon (or multipolygon) with a bounding box for fast rejection."""

    def __init__(self, polys, record: dict):
        self.polys = polys
        self.record = record
        xs = [x for p in polys for x, _ in p[0]]
        ys = [y for p in polys for _, y in p[0]]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))

    def contains(self, lat: float, lon: float) -> bool:
        x0, y0, x1, y1 = self.bbox
        if not (x0 <= lon <= x1 and y0 <= lat <= y1):
            return False
        for rings in self.polys:
            if _in_ring(lon, lat, rings[0]) and not any(_in_ring(lon, lat, h) for h in rings[1:]):
                return True
        return False


def build_areas(records: list[dict], geometry_field: str = "geometry") -> list[Area]:
    out = []
    for r in records:
        polys = parse_wkt(r.get(geometry_field))
        if polys:
            out.append(Area(polys, r))
    return out


def locate(lat: float, lon: float, areas: list[Area]) -> dict | None:
    """The first area containing the point (areas may overlap; first wins), else None."""
    for a in areas:
        if a.contains(lat, lon):
            return a.record
    return None
