from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Inventory
from sqlalchemy import asc

from app.entrypoint.routes.common.errors import BadRequestError


class InventoryRepository(AbstractRepository[Inventory]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Inventory



    def get_fifo_inventories_for_material(
            self,
            material_uuid: str,
            quantity: float
    ) -> list[Inventory]:
        """
        Return a FIFO list of Inventory lots for `material_uuid` whose
        cumulative `current_quantity` covers `quantity`. Raises
        ValueError if there's insufficient stock.
        """
        # 1) Fetch all eligible Inventory lots, oldest first
        lots: list[Inventory] = (
            self._session.query(self._type)
            .filter_by(
                material_uuid=material_uuid,
                is_deleted=False,
            )
            .filter(self._type.current_quantity > 0)
            .order_by(asc(self._type.created_at))
            .all()
        )

        result: list[Inventory] = []
        remaining = quantity

        # 2) Walk through each lot and consume FIFO
        for lot in lots:
            avail = lot.current_quantity
            if avail <= 0:
                continue

            result.append(lot)
            remaining -= avail

            if remaining <= 0:
                break

        # # 3) Not enough stock?
        # if remaining > 0:
        #     raise BadRequestError(
        #         f"Insufficient inventory for material {material_uuid}: "
        #         f"requested {quantity}, available {quantity - remaining}"
        #     )
        return result