from app.adapters.repositories._abstract_repo import AbstractRepository
from app.adapters.repositories._serialization_loaders import (
    PURCHASE_ORDER_ITEM_NOTE_LOADERS,
)
from models.common import Inventory, InventoryEvent
from sqlalchemy import asc
from sqlalchemy.orm import selectinload

from app.entrypoint.routes.common.errors import BadRequestError


# Everything a lot touches while it is serialized:
#
#   material_name (dto/inventory.py:72)   -> material
#   original_quantity (1630),
#   current_quantity (1651)               -> inventory_events
#   lot cost (domains/inventory/domain.py:141)
#                                         -> inventory_events
#     purchase-order receipt (domain.py:162)
#                                         -> inventory_events ->
#                                            purchase_order_item, whose
#                                            adjusted_price_per_unit (1335)
#                                            walks the note legs
#     process output (domain.py:172)      -> inventory_events -> process
#
# These do NOT cover the rest of this page's cost, and cannot:
# _lot_cost_and_quantity re-SELECTs lots by uuid through find_one, and reaches
# process INPUT lots by uuid out of Process.data, a JSON column. Those are
# repeated lookups in a Python loop, not relationship walks, so eager loading
# has no purchase on them — they need a memo on the cost context instead.
INVENTORY_SERIALIZATION_LOADERS = [
    selectinload(Inventory.material),
    selectinload(Inventory.inventory_events).selectinload(InventoryEvent.process),
    selectinload(Inventory.inventory_events)
    .selectinload(InventoryEvent.purchase_order_item)
    .options(*PURCHASE_ORDER_ITEM_NOTE_LOADERS),
]


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