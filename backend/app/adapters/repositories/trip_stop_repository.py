from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import TripStop

class TripStopRepository(AbstractRepository[TripStop]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = TripStop
