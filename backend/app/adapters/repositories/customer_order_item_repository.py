from models.common import CustomerOrderItem
from app.adapters.repositories._abstract_repo import AbstractRepository

class CustomerOrderItemRepository(AbstractRepository[CustomerOrderItem]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = CustomerOrderItem
