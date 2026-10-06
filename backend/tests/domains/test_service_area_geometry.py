"""The shape the setup form's picked areas cover.

One module, two callers: the route step that builds the trip and the pool
preview that reports on it. If they resolved names differently the preview
would be counting over a different map than the run.

Nothing in backend/tests imported trip_route_operator before this, so the
behaviours below — including the two that look like bugs — were untested.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon

from app.domains.service_area.geometry import (
    ServiceAreaCoverage,
    parts,
    service_area_coverage,
)
from app.entrypoint.routes.common.errors import BadRequestError


def square(x, y, size=1.0):
    return Polygon([(x, y), (x + size, y), (x + size, y + size), (x, y + size)])


def area(name, geometry):
    return SimpleNamespace(name=name, geometry=from_shape(geometry, srid=4326))


def uow_with(*areas):
    uow = MagicMock()
    uow.service_area_repository._find_all_by_filters.return_value = list(areas)
    return uow


def test_no_names_means_everywhere_not_nowhere():
    """None is the sentinel the pool query reads as "skip ST_Within". Getting
    this backwards would silently route nobody."""
    uow = uow_with()
    assert service_area_coverage(uow, []) == ServiceAreaCoverage(None, [])
    assert service_area_coverage(uow, None) == ServiceAreaCoverage(None, [])
    uow.service_area_repository._find_all_by_filters.assert_not_called()


def test_areas_combine_into_one_multipolygon():
    coverage = service_area_coverage(
        uow_with(area("north", square(0, 0)), area("south", square(10, 10))),
        ["north", "south"],
    )
    assert isinstance(coverage.polygon, MultiPolygon)
    assert len(coverage.polygon.geoms) == 2
    assert coverage.unmatched == []


def test_a_stored_multipolygon_is_flattened_into_its_parts():
    """MultiPolygon(MultiPolygon) is not valid — every part must be lifted."""
    stored = MultiPolygon([square(0, 0), square(2, 2), square(4, 4)])
    coverage = service_area_coverage(uow_with(area("three", stored)), ["three"])
    assert len(coverage.polygon.geoms) == 3


def test_a_partial_miss_covers_what_matched_and_reports_what_did_not():
    """The route step covers less ground than was ticked and says nothing.
    The preview cannot fix that, but it can surface it."""
    coverage = service_area_coverage(
        uow_with(area("north", square(0, 0))), ["north", "ghost", "also-ghost"],
    )
    assert len(coverage.polygon.geoms) == 1
    assert coverage.unmatched == ["ghost", "also-ghost"]


def test_a_total_miss_raises_rather_than_counting_the_whole_tenant():
    """Falling through to None here would report every customer in the
    tenant — a large, plausible, wrong number instead of an error."""
    with pytest.raises(BadRequestError) as e:
        service_area_coverage(uow_with(), ["ghost"])
    assert "ghost" in str(e.value)


def test_names_are_resolved_WITHOUT_an_is_deleted_filter():
    """Deliberate, and it matches the route step. The dropdown offers only
    live areas, but a stored pick must keep resolving after the area is
    soft-deleted — otherwise the preview and the run disagree the moment
    somebody archives one mid-setup."""
    uow = uow_with(area("archived", square(0, 0)))
    service_area_coverage(uow, ["archived"])

    kwargs = uow.service_area_repository._find_all_by_filters.call_args.kwargs
    rendered = " ".join(str(f) for f in kwargs["filters"])
    assert "is_deleted" not in rendered
    assert "name IN" in rendered


def test_parts_is_the_one_flattener():
    assert len(parts(square(0, 0))) == 1
    assert len(parts(MultiPolygon([square(0, 0), square(2, 2)]))) == 2
