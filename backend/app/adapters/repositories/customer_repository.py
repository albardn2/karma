from models.common import Customer
from app.adapters.repositories._abstract_repo import AbstractRepository

class CustomerRepository(AbstractRepository[Customer]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Customer
