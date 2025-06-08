from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Inventory


class InventoryRepository(AbstractRepository[Inventory]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Inventory
