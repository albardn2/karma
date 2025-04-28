from datetime import datetime

from app.dto.inventory import InventoryRead
from models.common import Inventory as InventoryModel
from app.dto.inventory import InventoryCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError


class InventoryDomain:
    @staticmethod
    def create_inventory(uow:SqlAlchemyUnitOfWork, payload: InventoryCreate) -> InventoryRead:
        inventory = InventoryModel(**payload.model_dump())

        if not inventory.lot_id:
            inventory.lot_id = InventoryDomain.generate_lot_id_dashed()

        if not inventory.cost_per_unit:
            inventory.cost_per_unit = 0.0

        uow.inventory_repository.save(model=inventory)
        return InventoryRead.from_orm(inventory)


    @staticmethod
    def delete_inventory(uow: SqlAlchemyUnitOfWork, uuid: str) -> InventoryRead:
        inventory = uow.inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError('Inventory not found')

        inventory.is_deleted = True
        uow.inventory_repository.save(model=inventory)
        return InventoryRead.from_orm(inventory)

    @staticmethod
    def generate_lot_id_dashed() -> str:
        # e.g. "2025-04-27-23-05-42"
        return datetime.utcnow().strftime("%Y-%m-%d-%H:%M:%S")