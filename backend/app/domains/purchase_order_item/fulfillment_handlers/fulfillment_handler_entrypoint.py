from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.purchase_order_item.fulfillment_handlers.inventory_fulfillment_handler import \
    InventoryFulfillmentHandler
from app.dto.material import MaterialType
from app.dto.purchase_order_item import PurchaseOrderItemRead, POFulfillItem
from app.entrypoint.routes.common.errors import NotFoundError


class PurchaseOrderItemFulfillmentHandler:
    def __init__(self):

        self.material_category_mapper = {
            MaterialType.RAW_MATERIAL: InventoryFulfillmentHandler
        }

    def run(self, uow: SqlAlchemyUnitOfWork,
            po_item: PurchaseOrderItemRead,
            po_item_fulfill_payload: POFulfillItem
            ) -> None:
        material = uow.material_repository.find_one(uuid=po_item.material_uuid, is_deleted=False)
        if not material:
            raise NotFoundError("Material not found")
        material_category = material.type
        handler = self.material_category_mapper.get(material_category)
        if handler:
            handler_instance = handler()
            handler_instance.run(uow=uow,
                                 po_item=po_item,
                                 po_item_fulfillment_payload=po_item_fulfill_payload)
        else:
            pass


