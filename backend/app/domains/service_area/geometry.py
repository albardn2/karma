"""The geometry a set of picked service areas covers.

ONE copy, because two callers must select over the same shape or they
disagree: the route step that actually builds the trip
(task_execution/workflow_operators/trip_route_operator.py) and the setup
form's pool preview (trip/strategy_preview.py). A preview computed over a
different polygon than the run is worse than no preview.
"""
from typing import List, NamedTuple, Optional

from geoalchemy2.shape import to_shape
from shapely import MultiPolygon

from app.entrypoint.routes.common.errors import BadRequestError
from models.common import ServiceArea as ServiceAreaModel


def parts(geometry):
    """A geometry's polygons, flattened — a stored MultiPolygon is many."""
    return list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]


class ServiceAreaCoverage(NamedTuple):
    # None means NO areas were picked, which means the WHOLE tenant — not
    # "nowhere". The pool query skips ST_Within entirely for None.
    polygon: Optional[MultiPolygon]
    # names that resolved to no row; the caller decides whether to surface them
    unmatched: List[str]


def service_area_coverage(uow, names) -> ServiceAreaCoverage:
    """The combined geometry of the service areas picked on the setup form.

    Two behaviours that look like bugs and are deliberately kept, because the
    route step has them and the preview must not diverge:

      - NO is_deleted filter. The form's dropdown offers only live areas, but
        the router resolves the stored names unfiltered. Adding the
        "obviously correct" filter here would desync the preview from the run
        the moment an area is soft-deleted after being picked.
      - a total miss RAISES rather than falling through to None. None means
        "everywhere", so swallowing it would count the entire tenant and
        report a large, plausible, wrong number instead of an error.
    """
    names = list(names or [])
    if not names:
        return ServiceAreaCoverage(None, [])
    areas = uow.service_area_repository._find_all_by_filters(
        filters=[ServiceAreaModel.name.in_(names)],
    )
    matched = {area.name for area in areas}
    polys = [p for area in areas for p in parts(to_shape(area.geometry))]
    if not polys:
        raise BadRequestError(f"None of the service areas {names} were found")
    return ServiceAreaCoverage(
        MultiPolygon(polys),
        [n for n in names if n not in matched],
    )
