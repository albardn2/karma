from app.dto.inventory_event import InventoryEventCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import InventoryEvent as InventoryEventModel
from app.dto.inventory_event import InventoryEventRead


class SalesEventHandler:

    def run(self,
            uow: SqlAlchemyUnitOfWork,
            event: InventoryEventCreate):

        # check inventory_uuid exists
        inventory = uow.inventory_repository.find_one(uuid=event.inventory_uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError("Inventory not found")

        customer_order_item = uow.customer_order_item_repository.find_one(uuid=event.customer_order_item_uuid, is_deleted=False)
        if not customer_order_item:
            raise NotFoundError("Customer Order Item not found")

        event_model = InventoryEventModel(**event.model_dump(mode='json'))
        inventory.current_quantity += event_model.quantity # event quantity could be negative
        if event_model.affect_original:
            inventory.original_quantity += event_model.quantity
        event_model.material_uuid = inventory.material_uuid
        uow.inventory_event_repository.save(model=event_model, commit=False)
        return InventoryEventRead.from_orm(event_model)


    def run_delete(self,uow: SqlAlchemyUnitOfWork, event: InventoryEventRead):
        # check inventory_uuid exists
        inventory = uow.inventory_repository.find_one(uuid=event.inventory_uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError("Inventory not found")

        event_model = uow.inventory_event_repository.find_one(uuid=event.uuid, is_deleted=False)
        if not event_model:
            raise NotFoundError("Inventory Event not found")

        event_model.is_deleted = True
        inventory.current_quantity -= event_model.quantity
        if event_model.affect_original:
            inventory.original_quantity -= event_model.quantity
        uow.inventory_event_repository.save(model=event_model, commit=False)

        return InventoryEventRead.from_orm(event_model)
