from datetime import datetime, timedelta, timezone
from typing import Union, List, Optional

from sqlalchemy import func, and_

from app.adapters.repositories._abstract_repo import AbstractRepository
from geoalchemy2.shape import from_shape
from shapely.geometry import Polygon, MultiPolygon

from models.common import (
    Customer,
    TripStop,
)


class CustomerRepository(AbstractRepository[Customer]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Customer

    def fetch_outstanding_balances(self, customer_uuids: List[str], currency: str) -> dict:
        """Outstanding balance per customer in ONE currency, set-based.

        The exact mirror of Customer._calculate_balance_per_currency —
        Σ net_amount_due of non-deleted invoices reached through non-deleted
        orders, + Σ debit_note_items.amount_due − Σ credit_note_items.amount_due
        — but as three grouped queries instead of a per-customer lazy-load walk
        of the whole invoice graph (which the repo has already measured melting
        down at scale: see the map-path comment in dto/customer.py). Built for
        the priority router's debt filter, which may evaluate hundreds of
        candidates inside one request.
        """
        from models.common import CreditNoteItem, CustomerOrder, DebitNoteItem, Invoice

        if not customer_uuids:
            return {}
        balances = {uuid: 0.0 for uuid in customer_uuids}
        invoice_rows = (
            self._session.query(
                CustomerOrder.customer_uuid, func.sum(Invoice.net_amount_due)
            )
            .join(Invoice, Invoice.customer_order_uuid == CustomerOrder.uuid)
            .filter(
                CustomerOrder.customer_uuid.in_(customer_uuids),
                CustomerOrder.is_deleted == False,  # noqa: E712
                Invoice.is_deleted == False,  # noqa: E712
                Invoice.currency == currency,
            )
            .group_by(CustomerOrder.customer_uuid)
        )
        for customer_uuid, total in invoice_rows:
            balances[customer_uuid] += float(total or 0)
        debit_rows = (
            self._session.query(
                DebitNoteItem.customer_uuid, func.sum(DebitNoteItem.amount_due)
            )
            .filter(
                DebitNoteItem.customer_uuid.in_(customer_uuids),
                DebitNoteItem.is_deleted == False,  # noqa: E712
                DebitNoteItem.currency == currency,
            )
            .group_by(DebitNoteItem.customer_uuid)
        )
        for customer_uuid, total in debit_rows:
            balances[customer_uuid] += float(total or 0)
        credit_rows = (
            self._session.query(
                CreditNoteItem.customer_uuid, func.sum(CreditNoteItem.amount_due)
            )
            .filter(
                CreditNoteItem.customer_uuid.in_(customer_uuids),
                CreditNoteItem.is_deleted == False,  # noqa: E712
                CreditNoteItem.currency == currency,
            )
            .group_by(CreditNoteItem.customer_uuid)
        )
        for customer_uuid, total in credit_rows:
            balances[customer_uuid] -= float(total or 0)
        return balances

    def fetch_priority_routing_pool(
            self,
            polygon: Optional[Union[Polygon, MultiPolygon]] = None,
    ) -> List[Customer]:
        """The candidate pool for the priority router (2026-08 strategies).

        Base eligibility only — the strategy's own filters (tags, category,
        debt, last-effective-stop age) run in Python on top of this:
          - tenant-scoped, not deleted, HAS coordinates (clustering needs them)
          - inside the given polygon when the setup picked service areas;
            everywhere otherwise
          - not already on an active trip (any planned/in_progress stop),
            same rule as the legacy pipeline
        Deliberately NOT applied here: the legacy completed-stop recency
        exclusion — recency is a per-priority filter now
        (last_effective_stop_days).
        """
        qry = self._session.query(Customer).filter(*self._scope_filters(None))
        qry = qry.filter(Customer.is_deleted == False)  # noqa: E712
        qry = qry.filter(Customer.coordinates.isnot(None))
        if polygon is not None:
            qry = qry.filter(
                func.ST_Within(Customer.coordinates, from_shape(polygon, srid=4326))
            )
        qry = qry.filter(
            ~Customer.trip_stops.any(
                TripStop.status.in_(["planned", "in_progress"])
            )
        )
        return qry.all()

    def fetch_distribution_customers_for_polygon(
            self,
            polygon: Union[Polygon, MultiPolygon],
            last_visit_threshold_days: int,
            customer_categories: Optional[List[str]] = None,
    ) -> List[Customer]:
        """
        Return Customers inside the given polygon who:
          - Are in one of the provided categories (if any), AND
          - Do NOT have any TripStops with status in {"planned", "in_progress"}, AND
          - Do NOT have any 'completed' TripStops whose created_at is within the last N days.

        Args:
            polygon: Shapely Polygon or MultiPolygon in WGS84 (EPSG:4326).
            last_visit_threshold_days: Exclude customers visited within this many days (completed stops).
            customer_categories: Optional list of category names to include.

        Returns:
            List[Customer]: Matching customers.
        """
        # Use timezone-aware UTC to avoid naive/aware comparison issues
        cutoff = datetime.now(timezone.utc) - timedelta(days=last_visit_threshold_days)

        # Scope to the caller's account. This is the one Customer read path that
        # built its query by hand instead of going through the repository
        # helpers, so it had no tenant filter at all — it could route another
        # account's customers into this account's trip. Latent until now only
        # because the status filter below excluded almost everybody; releasing
        # those customers is exactly what widens it.
        qry = self._session.query(Customer).filter(*self._scope_filters(None))

        # remove customers with is_deleted=True
        qry = qry.filter(Customer.is_deleted == False)

        # 1) Geo filter is always applied (point within polygon)
        geom = from_shape(polygon, srid=4326)
        qry = qry.filter(func.ST_Within(Customer.coordinates, geom))

        # 2) Category filter, only if provided
        if customer_categories:
            qry = qry.filter(Customer.category.in_(customer_categories))

        # 3) Exclude customers that have any planned or in-progress trip stops
        qry = qry.filter(
            ~Customer.trip_stops.any(
                TripStop.status.in_(["planned", "in_progress"])
            )
        )

        # 4) Exclude customers that have a completed stop within the threshold
        qry = qry.filter(
            ~Customer.trip_stops.any(
                and_(
                    TripStop.status == "completed",
                    TripStop.created_at >= cutoff,
                    )
            )
        )

        return qry.all()
