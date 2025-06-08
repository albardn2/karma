from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Task

class TaskRepository(AbstractRepository[Task]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Task
