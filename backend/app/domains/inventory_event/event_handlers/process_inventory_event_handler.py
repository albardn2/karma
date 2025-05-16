from app.dto.inventory_event import InventoryEventCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import InventoryEvent as InventoryEventModel
from app.dto.inventory_event import InventoryEventRead


class ProcessEventHandler:

    def run(self,
            uow: SqlAlchemyUnitOfWork,
            event: InventoryEventCreate):

        # check inventory_uuid exists
        inventory = uow.inventory_repository.find_one(uuid=event.inventory_uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError("Inventory not found")

        process = uow.process_repository.find_one(uuid=event.process_uuid, is_deleted=False)
        if not process:
            raise NotFoundError("Process not found")

        event_model = InventoryEventModel(**event.model_dump(mode='json'))
        inventory.current_quantity += event_model.quantity # event quantity could be negative
        if inventory.current_quantity > 0:
            inventory.original_quantity += event_model.quantity
        # TODO: method to recalculate those quantities based on the aggregated events
        event_model.material_uuid = inventory.material_uuid
        uow.inventory_event_repository.save(model=event_model, commit=False)

        return InventoryEventRead.from_orm(event_model)
