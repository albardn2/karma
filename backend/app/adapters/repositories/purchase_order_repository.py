from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import PurchaseOrder


class PurchaseOrderRepository(AbstractRepository[PurchaseOrder]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = PurchaseOrder
