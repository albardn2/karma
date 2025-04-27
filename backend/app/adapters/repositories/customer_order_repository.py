from models.common import CustomerOrder
from app.adapters.repositories._abstract_repo import AbstractRepository

class CustomerOrderRepository(AbstractRepository[CustomerOrder]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = CustomerOrder
