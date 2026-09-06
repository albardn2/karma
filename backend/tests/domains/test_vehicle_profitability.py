"""The per-vehicle profitability endpoint must stay scoped to its vehicle.

Its whole reason to exist is a vehicle filter on every term — revenue, COGS and
expenses. Dropping any one of them silently turns the chart into an account-wide
total mislabelled as one vehicle's, leaking other vehicles' figures. Dashboard
routes 401 in the unit harness (no JWT), so this pins the invariant by reading
the source rather than exercising the endpoint; the numbers themselves are
verified live.
"""
import inspect

from app.entrypoint.routes.dashboard import routes as mod


def _src():
    return inspect.getsource(mod.vehicle_profitability)


def test_all_three_terms_filter_on_the_vehicle():
    src = _src()
    # revenue and COGS reach the vehicle through the order's trip-stop -> trip
    assert src.count("TripModel.vehicle_uuid == vehicle_uuid") == 2
    # expenses are tied to the vehicle directly
    assert "ExpenseModel.vehicle_uuid == vehicle_uuid" in src
    # every query is also tenant-scoped, same as the account-wide endpoint
    assert src.count("account_uuid == uow.account_uuid") >= 3


def test_missing_or_unknown_vehicle_is_refused():
    src = _src()
    assert 'raise BadRequestError("vehicle_uuid is required")' in src
    assert 'raise NotFoundError("Vehicle not found")' in src


def test_net_excludes_salaries_and_uses_vehicle_expenses():
    """Net here is revenue − COGS − vehicle expenses; a wage is not attributable
    to a vehicle, so salaries must not creep back into the subtraction."""
    src = _src()
    assert "net = round(revenue[k] - cogs[k] - expenses[k], 2)" in src
    assert "salaries" not in src


def test_revenue_and_cogs_share_the_order_trip_stop_basis():
    """gross = revenue − COGS only means anything if both count the SAME sales:
    revenue off the order and COGS off that order's items, both joined to the
    order's trip stop."""
    src = _src()
    assert "TripStopModel.uuid == CustomerOrderModel.trip_stop_uuid" in src
    assert "CustomerOrderModel.uuid == CustomerOrderItemModel.customer_order_uuid" in src
    assert 'InventoryEventModel.event_type == "sale"' in src
