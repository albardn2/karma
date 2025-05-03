from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Process


class ProcessRepository(AbstractRepository[Process]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Process
