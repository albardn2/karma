from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Workflow

class WorkflowRepository(AbstractRepository[Workflow]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Workflow
