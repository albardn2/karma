from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import CreditNoteItem


class CreditNoteItemRepository(AbstractRepository[CreditNoteItem]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = CreditNoteItem
