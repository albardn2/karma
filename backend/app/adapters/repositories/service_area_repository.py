from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import ServiceArea

class ServiceAreaRepository(AbstractRepository[ServiceArea]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = ServiceArea
