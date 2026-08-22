from sqlalchemy import func

from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import RoutingStrategy


class RoutingStrategyRepository(AbstractRepository[RoutingStrategy]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = RoutingStrategy

    def find_by_name_ci(self, name) -> RoutingStrategy | None:
        """Case-insensitive live-strategy lookup.

        BOTH sides fold through SQL lower(): Python's str.lower() disagrees
        with Postgres for some non-ASCII case pairs (Turkish İ becomes
        i+combining-dot in Python but plain i under en_US.utf8), so mixing the
        two case-folding authorities can make a stored name unresolvable. The
        partial unique index (account_uuid, lower(name)) uses the same fold,
        so at most one live row can match.
        """
        rows = self._find_all_by_filters(filters=[
            func.lower(RoutingStrategy.name) == func.lower(str(name).strip()),
            RoutingStrategy.is_deleted == False,  # noqa: E712
        ])
        return rows[0] if rows else None
