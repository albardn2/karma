from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.inventory_event import InventoryEventCreate
from app.dto.inventory_event import InventoryEventType
from app.domains.inventory_event.event_handlers.sales_event_handler import SalesEventHandler
from app.dto.inventory_event import InventoryEventRead
from app.domains.inventory_event.event_handlers.purchase_order_event_handler import PurchaseOrderEventHandler

from app.domains.inventory_event.event_handlers.adjustement_event_handler import AdjustmentEventHandler


class InventoryEventHandlerEntryPoint:

    def __init__(self):

        self.handler_mapper = {
            InventoryEventType.SALE: SalesEventHandler,
            InventoryEventType.PURCHASE_ORDER: PurchaseOrderEventHandler,
            InventoryEventType.ADJUSTMENT: AdjustmentEventHandler
        }

    def handle_event(self,uow: SqlAlchemyUnitOfWork, event: InventoryEventCreate) -> InventoryEventRead:
        # Handle the event here

        event_type = event.event_type
        handler = self.handler_mapper.get(event_type)
        if handler:
            handler_instance = handler()
            handler_instance.run(uow=uow,event=event)
        else:
            raise ValueError(f"No handler found for event type: {event_type}")


