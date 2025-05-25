from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventCreate, InventoryEventType
from app.dto.purchase_order_item import PurchaseOrderItemRead, POFulfillItem

from app.domains.inventory.domain import InventoryDomain
from app.dto.inventory import InventoryCreate

from app.entrypoint.routes.common.errors import BadRequestError


class InventoryFulfillmentHandler:

    def run(self,
            uow: SqlAlchemyUnitOfWork,
            po_item: PurchaseOrderItemRead,
            po_item_fulfillment_payload: POFulfillItem
            ):

        # check if we should create an inventory entry or use existing entries
        inventory_uuid = None
        if po_item_fulfillment_payload.inventory_uuid:
            inventory_uuid = po_item_fulfillment_payload.inventory_uuid
            self.validate_material(uow=uow,inventory_uuid=inventory_uuid,material_uuid=po_item.material_uuid)
        elif po_item_fulfillment_payload.warehouse_uuid:
            # create a new inventory entry with the po item and warehouse
            inv_create_payload = InventoryCreate(
                material_uuid=po_item.material_uuid,
                warehouse_uuid=po_item_fulfillment_payload.warehouse_uuid,

            )
            inventory_read = InventoryDomain.create_inventory(uow,inv_create_payload)
            inventory_uuid = inventory_read.uuid

        event_read = InventoryEventDomain.create_inventory_event(
            uow=uow,
            payload=InventoryEventCreate(
                quantity=po_item.quantity,
                event_type=InventoryEventType.PURCHASE_ORDER,
                purchase_order_item_uuid=po_item.uuid,
                inventory_uuid=inventory_uuid,
                affect_original=True,
            ))
        return event_read

    def validate_material(self,uow: SqlAlchemyUnitOfWork,inventory_uuid:str, material_uuid: str):
        existing_inventory = uow.inventory_repository.find_one(uuid=inventory_uuid, is_deleted=False)
        if not existing_inventory:
            raise BadRequestError("Inventory not found")
        if existing_inventory.material_uuid != material_uuid:
            raise BadRequestError("Material not found in inventory")
