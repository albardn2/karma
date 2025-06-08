from datetime import datetime, timedelta
from typing import Union, List, Optional

from app.adapters.repositories._abstract_repo import AbstractRepository
from geoalchemy2 import WKTElement
from shapely import Polygon, MultiPolygon
from models.common import (
    Customer,
    TripStop,
    CustomerOrder,
    CustomerOrderItem,
)
from sqlalchemy import distinct, func


class CustomerRepository(AbstractRepository[Customer]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Customer

    def fetch_distribution_customers_for_polygon(
            self,
            polygon: Union[Polygon, MultiPolygon],
            last_ordered_threshold_days: int,
            categories: Optional[List[str]] = None,
            material_uuids: Optional[List[str]] = None,
    ) -> List[Customer]:
        """
        Find customers who:
          • Are located within `polygon`
          • If `categories` is given, whose category is in that list
          • If `material_uuids` is given, have NOT ordered ALL of those in the
            past `last_ordered_threshold_days`
          • Are not in any TripStop with status 'planned' or 'in_progress'
        """
        cutoff = datetime.utcnow() - timedelta(days=last_ordered_threshold_days)

        qry = self._session.query(Customer)

        # 1) Geo filter is always applied
        geo_filter = func.ST_Within(
            Customer.coordinates,
            WKTElement(polygon.wkt, srid=4326)
        )
        qry = qry.filter(geo_filter)

        # 2) Category filter, only if provided
        if categories:
            qry = qry.filter(Customer.category.in_(categories))

        # 3) Material check: only if provided and non-empty
        if material_uuids:
            # Subquery: count how many DISTINCT of those materials each customer ordered recently
            ordered_counts = (
                self._session
                .query(
                    Customer.uuid.label("cust_uuid"),
                    func.count(distinct(CustomerOrderItem.material_uuid)).label("cnt")
                )
                .join(CustomerOrder, Customer.uuid == CustomerOrder.customer_uuid)
                .join(CustomerOrderItem, CustomerOrder.uuid == CustomerOrderItem.customer_order_uuid)
                .filter(
                    CustomerOrder.created_at >= cutoff,
                    CustomerOrderItem.material_uuid.in_(material_uuids)
                )
                .group_by(Customer.uuid)
                .subquery()
            )

            # Outer-join on that count and require they’ve ordered fewer than the full set
            qry = (
                qry
                .outerjoin(
                    ordered_counts,
                    Customer.uuid == ordered_counts.c.cust_uuid
                )
                .filter(
                    func.coalesce(ordered_counts.c.cnt, 0) < len(material_uuids)
                )
            )
        else:
            # check if there are any orders within cutoff regardless of materials
            qry = (
                qry
                .join(CustomerOrder, Customer.uuid == CustomerOrder.customer_uuid)
                .filter(CustomerOrder.created_at >= cutoff)
                .distinct()
            )

        # 4) Exclude any customer with an in-flight or planned trip stop
        qry = qry.filter(
            ~Customer.trip_stops.any(
                TripStop.status.in_(["planned", "in_progress"])
            )
        )

        return qry.all()
