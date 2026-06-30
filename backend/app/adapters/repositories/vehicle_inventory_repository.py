from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import VehicleInventory


class VehicleInventoryRepository(AbstractRepository[VehicleInventory]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = VehicleInventory
