from sqlalchemy.orm import selectinload

from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import (
    CustomerOrderItem,
    Expense,
    Invoice,
    Payment,
    Trip,
    TripStop,
    VehicleInventoryEvent,
)


# Everything TripRead's derived fields walk while a trip is serialized, so a
# page of trips costs a handful of queries instead of one per row per
# relationship. Mirrors the properties in models/common.py exactly:
#
#   expected_cash (2200)            -> stops -> payments -> invoice -> customer_order
#   inventory_reconciliation (2328) -> sold_inventory_map (2294) -> stops ->
#                                      vehicle_inventory_events ->
#                                      customer_order_item -> customer_order
#   trip_expenses* (2218)           -> expenses -> payouts (via Expense.amount_paid, 1409)
#   vehicle_plate (dto/trip.py:195) -> vehicle
#
# If one of those properties grows a new hop, add it here or the list quietly
# goes back to one query per row — which is why
# tests/domains/test_trip_eager_loading.py asserts a statement COUNT rather
# than just a correct response.
#
# selectinload throughout, never joinedload: a JOIN would multiply each trip
# row by its stops and LIMIT 20 would then return 20 rows rather than 20
# trips.
TRIP_SERIALIZATION_LOADERS = [
    selectinload(Trip.vehicle),
    selectinload(Trip.expenses).selectinload(Expense.payouts),
    selectinload(Trip.stops)
    .selectinload(TripStop.payments)
    .selectinload(Payment.invoice)
    .selectinload(Invoice.customer_order),
    selectinload(Trip.stops)
    .selectinload(TripStop.vehicle_inventory_events)
    .selectinload(VehicleInventoryEvent.customer_order_item)
    .selectinload(CustomerOrderItem.customer_order),
]


class TripRepository(AbstractRepository[Trip]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Trip
