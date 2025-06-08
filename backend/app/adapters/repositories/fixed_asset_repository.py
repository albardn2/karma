from app.adapters.repositories._abstract_repo import AbstractRepository
from models.common import FixedAsset


class FixedAssetRepository(AbstractRepository[FixedAsset]):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._type = FixedAsset
