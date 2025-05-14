

from app.dto.inventory_event import InventoryEventCreate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError
from models.common import InventoryEvent as InventoryEventModel
from app.dto.inventory_event import InventoryEventRead


class AdjustmentEventHandler:

    def run(self,
            uow: SqlAlchemyUnitOfWork,
            event: InventoryEventCreate):

        # check inventory_uuid exists
        inventory = uow.inventory_repository.find_one(uuid=event.inventory_uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError("Inventory not found")

        if event.customer_order_item_uuid:
            customer_order_item = uow.customer_order_item_repository.find_one(uuid=event.customer_order_item_uuid, is_deleted=False)
            if not customer_order_item:
                raise NotFoundError("Customer Order Item not found")

        elif event.purchase_order_item_uuid:
            purchase_order_item = uow.purchase_order_item_repository.find_one(uuid=event.purchase_order_item_uuid, is_deleted=False)
            if not purchase_order_item:
                raise NotFoundError("Purchase Order Item not found")

        event_model = InventoryEventModel(**event.model_dump(mode='json'))
        inventory.current_quantity += event_model.quantity # event quantity could be negative
        event_model.material_uuid = inventory.material_uuid
        uow.inventory_event_repository.save(model=event_model, commit=False)

        return InventoryEventRead.from_orm(event_model)
