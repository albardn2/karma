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

        qry = self._session.query(Customer)

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
