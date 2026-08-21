from sqlalchemy import func

from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import RoutingStrategy


class RoutingStrategyRepository(AbstractRepository[RoutingStrategy]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = RoutingStrategy

    def find_by_name_ci(self, name) -> RoutingStrategy | None:
        """Case-insensitive live-strategy lookup.

        The stored setup result round-trips through resolve_strategy, which
        lowercases (the built-ins are matched that way), so the name that
        reaches the route step may not match the stored casing exactly.
        """
        rows = self._find_all_by_filters(filters=[
            func.lower(RoutingStrategy.name) == str(name).strip().lower(),
            RoutingStrategy.is_deleted == False,  # noqa: E712
        ])
        return rows[0] if rows else None
