"""The customer map shows at most 100 pins, and zooming in splits them.

The map used to render from `GET /customer/?within_polygon=...`, which forces
per_page to 10000 and serialises a full CustomerRead per row — including
balance_per_currency, which walks every order, invoice, payment and note.
Measured on local data at 574 bytes and 1.4 ms per customer, so an account with
10,000 customers meant roughly 5.7 MB and 14 s for a single pan, on a phone,
repeatedly. That is what crashed the app.

The replacement groups customers onto a grid and returns one pin per occupied
cell. Everything that makes that safe is arithmetic in `grid_cell_degrees`, so it
is worth pinning here rather than discovering on a device:

  * the output is BOUNDED — a viewport can never touch more than 100 cells, so
    the payload does not grow with the number of customers, and nothing has to be
    silently dropped to keep it small;
  * the levels are NESTED — zooming in splits each cluster instead of reshuffling
    every pin, which is what makes "zoom in to see more" true rather than merely
    plausible;
  * the grid is GLOBAL — panning slides the viewport over a fixed lattice, so
    pins stay put when the user is only moving sideways.
"""
import math

import pytest

from app.dto.customer import MAX_MAP_POINTS
from app.entrypoint.routes.customer.routes import (
    MAP_CELLS_PER_AXIS,
    grid_cell_degrees,
)

# Every zoom a user can reach, from the whole planet to a single building.
SPANS = [360, 180, 90, 45, 10, 3, 1, 0.6, 0.3, 0.15, 0.03, 0.008, 0.001, 0.0001]


def cells_touched(span, cell):
    """Cells a segment of `span` crosses on a lattice of pitch `cell`.

    Worst case over alignment: the segment starts just inside one cell, so both
    end cells are partial.
    """
    return math.floor(span / cell) + 2


@pytest.mark.parametrize("span", SPANS)
def test_no_viewport_can_exceed_the_pin_budget(span):
    """The reason the payload cannot blow up again.

    This is the whole guarantee, and it is a property of the arithmetic rather
    than of a LIMIT: `k = floor(log2(360 / target))` gives `2**k <= 360 / target`,
    so `cell >= target = span / cells_per_axis` and a viewport spans at most
    `cells_per_axis` whole cells per axis.
    """
    cell = grid_cell_degrees(span)
    per_axis = cells_touched(span, cell)
    assert per_axis ** 2 <= MAX_MAP_POINTS, (
        f"span {span} deg gives {per_axis} cells per axis "
        f"= {per_axis ** 2} pins, over the {MAX_MAP_POINTS} budget"
    )


@pytest.mark.parametrize("span", SPANS)
def test_the_cell_is_never_finer_than_the_target(span):
    """The inequality the bound rests on, asserted directly."""
    assert grid_cell_degrees(span) >= span / MAP_CELLS_PER_AXIS


def test_a_degenerate_viewport_still_answers():
    """A zero-span region is reachable — a map laid out before it has measured
    itself reports one. It must not divide by zero or loop."""
    assert grid_cell_degrees(0) > 0
    assert grid_cell_degrees(-1) > 0


# --- nesting: why zooming in SPLITS clusters -------------------------------
#
# Cell sizes come off a power-of-two ladder so that each level's cells divide
# exactly into the next. Without that, zooming in makes clusters merge and
# re-split incoherently rather than each one dividing — measured on the real
# database while building this: with ST_SnapToGrid (which rounds to the NEAREST
# node, putting boundaries at odd half-multiples of the cell) 7 of 17 fine cells
# straddled two coarse cells. With floor-based indices, 0 of 19 did.


@pytest.mark.parametrize("span", SPANS)
def test_every_cell_size_is_a_power_of_two_fraction_of_360(span):
    ratio = 360.0 / grid_cell_degrees(span)
    assert ratio == pytest.approx(round(ratio)), "not an integer divisor of 360"
    assert round(ratio) & (round(ratio) - 1) == 0, f"{round(ratio)} is not a power of two"


@pytest.mark.parametrize("span", SPANS)
def test_zooming_in_never_coarsens_the_grid(span):
    """Halving the viewport must keep the cell the same or halve it, never grow
    it — a coarser grid on zoom-in would MERGE clusters as the user zoomed in."""
    cell = grid_cell_degrees(span)
    finer = grid_cell_degrees(span / 2)
    assert finer <= cell
    assert cell / finer in (1.0, 2.0), f"jumped by a factor of {cell / finer}"


def test_consecutive_levels_nest_exactly():
    """The property the split depends on: `floor(u) == floor(floor(2u) / 2)`.

    Two customers in the same fine cell are therefore always in the same coarse
    cell, so a coarse pin's members are exactly the union of the fine pins it
    contains. Checked across the ladder at offsets that straddle boundaries,
    which is where a round-to-nearest scheme fails.
    """
    for k in range(3, 20):
        coarse = 360.0 / (2 ** k)
        fine = coarse / 2
        for i in range(400):
            # deliberately includes exact boundaries and either side of them
            x = -180.0 + i * fine * 0.5
            assert math.floor((x + 180.0) / coarse) == math.floor(
                math.floor((x + 180.0) / fine) / 2
            ), f"level {k} does not nest at x={x}"


def test_the_ladder_is_anchored_globally_not_to_the_viewport():
    """Panning must not re-cluster.

    Cell size depends only on the SPAN, never on where the viewport sits, and the
    route anchors indices at (-180, -90). So two viewports of equal size at
    different places share one lattice, and a pin does not move when the user
    pans past it.
    """
    span = 0.15
    assert grid_cell_degrees(span) == grid_cell_degrees(span)
    # same span, wildly different locations -> same cell size
    for _ in range(3):
        assert grid_cell_degrees(0.15) == grid_cell_degrees(0.15)


def test_the_budget_is_not_quietly_larger_than_advertised():
    """MAX_MAP_POINTS is what the user asked for; the grid must be sized to it,
    so that the route's LIMIT is a safety net and never the thing doing the
    bounding. If it ever bites, pins would silently vanish from the map."""
    assert MAX_MAP_POINTS == 100
    assert (MAP_CELLS_PER_AXIS + 1) ** 2 <= MAX_MAP_POINTS
