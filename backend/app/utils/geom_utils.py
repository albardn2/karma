from app.entrypoint.routes.common.errors import BadRequestError
from geoalchemy2 import WKTElement, WKBElement
from shapely import Point
from shapely import wkb as shapely_wkb
from shapely import wkt as shapely_wkt

def lat_lon_to_wkt(coords: str) -> str:
    if not isinstance(coords, str):
        raise BadRequestError("`coordinates` must be a string in 'lat,lon' format")

    parts = coords.split(",")
    if len(parts) != 2:
        raise BadRequestError("`coordinates` must be 'lat,lon' (two comma‐separated values)")
    try:
        lat = float(parts[0].strip())
        lon = float(parts[1].strip())
    except ValueError:
        raise BadRequestError("`coordinates` must contain valid numeric lat and lon")
    # Build a Shapely Point and return its WKT:
    pt = Point(lon, lat)
    return pt.wkt


def wkt_or_wkb_to_lat_lon(value: str) -> str:
    """
    Convert a WKT Point to 'lat,lon' format.
    """
    if value is None:
        raise BadRequestError("`coordinates` cannot be None")

    # if already lat,lon string, return it directly
    if isinstance(value, str) and "," in value:
        return value.strip()  # Already in 'lat,lon' format

    # 1) If it's a WKTElement, v.data is WKT string
    if isinstance(value, WKTElement):
        geom = shapely_wkt.loads(value.data)

    # 2) If it's a WKBElement, convert to shapely via to_shape
    elif isinstance(value, WKBElement):
        from geoalchemy2.shape import to_shape
        geom = to_shape(value)

    # 3) If raw bytes, interpret as WKB
    elif isinstance(value, (bytes, bytearray)):
        geom = shapely_wkb.loads(bytes(value))

    # 4) If it's already a WKT string
    elif isinstance(value, str):
        geom = shapely_wkt.loads(value)

    else:
        raise BadRequestError("Unsupported type for coordinates")

    if not isinstance(geom, Point) or not geom.is_valid:
        raise BadRequestError("`coordinates` did not resolve to a valid Point")

    lat = geom.y
    lon = geom.x
    return f"{lat},{lon}"