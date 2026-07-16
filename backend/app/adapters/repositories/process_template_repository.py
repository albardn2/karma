from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import ProcessTemplate


class ProcessTemplateRepository(AbstractRepository[ProcessTemplate]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = ProcessTemplate
