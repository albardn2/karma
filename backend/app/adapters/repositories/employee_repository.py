from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import Employee


class EmployeeRepository(AbstractRepository[Employee]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = Employee
