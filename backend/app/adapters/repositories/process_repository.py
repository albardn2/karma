from datetime import datetime
from typing import Optional

from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Process
from sqlalchemy import not_, and_



class ProcessRepository(AbstractRepository[Process]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Process

    def find_filtered_excluding_input_material(
            self,
            material_uuid: str,
            *,
            process_type: Optional[str] = None,
            created_at_from: Optional[datetime] = None,
            created_at_to:   Optional[datetime] = None,
    ) -> list[Process]:
        """
        Fetch all Process rows where:
          - `data['inputs']` does NOT contain any object with "material_uuid" = material_uuid
          - AND (if provided) process.type == process_type
          - AND (if provided) process.created_at >= created_at_from
          - AND (if provided) process.created_at <= created_at_to

        Returns a list of matching Process objects.
        """
        filters = []

        # 1) Exclude any Process whose data->'inputs' array contains {"material_uuid": material_uuid}
        filters.append(
            not_(
                self._type.data["inputs"].contains([{"material_uuid": material_uuid}])
            )
        )

        # 2) If `process_type` was passed, add a filter on the `type` column
        if process_type is not None:
            filters.append(self._type.type == process_type)

        # 3) If `created_at_from` was passed, add a ">= created_at_from" filter
        if created_at_from is not None:
            filters.append(self._type.created_at >= created_at_from)

        # 4) If `created_at_to` was passed, add a "<= created_at_to" filter
        if created_at_to is not None:
            filters.append(self._type.created_at <= created_at_to)

        # Combine everything with AND.  If no additional filters beyond the "not contains" condition
        # were passed, this still works correctly, since `filters` will at least hold the exclusion.
        return (
            self._session
            .query(self._type)
            .filter(and_(*filters))
            .all()
        )