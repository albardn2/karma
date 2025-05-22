from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.purchase_order_item import PurchaseOrderItemCreate
from app.dto.purchase_order_item import PurchaseOrderItemRead
from models.common import PurchaseOrderItem as PurchaseOrderItemModel

from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from app.dto.purchase_order_item import PurchaseOrderItemBulkFulfill
from app.domains.purchase_order_item.fulfillment_handlers.fulfillment_handler_entrypoint import PurchaseOrderItemFulfillmentHandler
from app.dto.purchase_order_item import PurchaseOrderItemBulkUnFulfill
from app.domains.inventory.domain import InventoryDomain
from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventType


class PurchaseOrderItemDomain:

    @staticmethod
    def fulfill_items(uow: SqlAlchemyUnitOfWork, payload: PurchaseOrderItemBulkFulfill) -> list[PurchaseOrderItemRead]:

        items = []
        for item in payload.items:
            po_item = uow.purchase_order_item_repository.find_one(uuid=item.purchase_order_item_uuid, is_deleted=False)
            if not po_item:
                raise NotFoundError("PurchaseOrderItem not found")
            if po_item.is_fulfilled:
                raise BadRequestError("PurchaseOrderItem already fulfilled")
            po_item.is_fulfilled = True
            po_item.fulfilled_at = datetime.now()
            items.append(po_item)

            PurchaseOrderItemFulfillmentHandler().run(uow=uow,
                                                      po_item=PurchaseOrderItemRead.from_orm(po_item),
                                                        po_item_fulfill_payload=item,
                                                      )
        # handle po_fulfillment

        uow.purchase_order_item_repository.batch_save(models=items, commit=False)
        return [PurchaseOrderItemRead.from_orm(po_item) for po_item in items]


    @staticmethod
    def unfulfill_items(uow: SqlAlchemyUnitOfWork, payload: PurchaseOrderItemBulkUnFulfill) -> list[PurchaseOrderItemRead]:
        items = []
        for item in payload.items:
            po_item = uow.purchase_order_item_repository.find_one(uuid=item.purchase_order_item_uuid, is_deleted=False)
            if not po_item:
                raise NotFoundError("PurchaseOrderItem not found")
            if not po_item.is_fulfilled:
                raise BadRequestError("PurchaseOrderItem already unfulfilled")
            po_item.is_fulfilled = False
            po_item.fulfilled_at = None

            # delete event
            inventory_events = [event for event in po_item.inventory_events if not event.is_deleted and event.event_type == InventoryEventType.PURCHASE_ORDER.value]
            if len(inventory_events) !=1:
                raise BadRequestError("PO inventory event count is not 1")
            InventoryEventDomain.delete_inventory_event(
                uow=uow,
                uuid=inventory_events[0].uuid

            )

            uow.inventory_event_repository.save(model=inventory_events[0], commit=False)

            # delete inventory entry if no event are attached, else raise exception
            InventoryDomain.delete_inventory(
                uow=uow,
                uuid=inventory_events[0].inventory_uuid
            )
            items.append(po_item)



        uow.purchase_order_item_repository.batch_save(models=items, commit=False)
        return [PurchaseOrderItemRead.from_orm(po_item) for po_item in items]



    @staticmethod
    def create_items(uow: SqlAlchemyUnitOfWork, items: list[PurchaseOrderItemCreate]) -> list[PurchaseOrderItemRead]:
        """
        Create purchase order items.
        """
        created_models = []
        for item in items:
            data = item.model_dump(mode='json')
            po_item = PurchaseOrderItemModel(**data)
            created_models.append(po_item)
        uow.purchase_order_item_repository.batch_save(models=created_models, commit=False)

        return [PurchaseOrderItemRead.from_orm(po_item) for po_item in created_models]

    @staticmethod
    def delete_items(uow: SqlAlchemyUnitOfWork, uuids: list[str]) -> None:
        """
        Delete purchase order items.
        """
        for uuid in uuids:
            PurchaseOrderItemDomain.delete_item(uow=uow, uuid=uuid)

    @staticmethod
    def delete_item(uow: SqlAlchemyUnitOfWork, uuid: str) -> None:
        po_item = uow.purchase_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not po_item:
            raise NotFoundError("PurchaseOrderItem not found")

        PurchaseOrderItemDomain.validate_po_item_delete(uow=uow, po_item=po_item)
        po_item.is_deleted = True
        uow.purchase_order_item_repository.save(model=po_item, commit=False)


    @staticmethod
    def validate_po_item_delete(uow: SqlAlchemyUnitOfWork, po_item: PurchaseOrderItemModel) -> None:
        """
        Validate if the purchase order item can be deleted.
        """
        if po_item.is_deleted:
            raise BadRequestError("PurchaseOrderItem already deleted")

        if po_item.is_fulfilled:
            raise BadRequestError("PurchaseOrderItem already fulfilled")

        credit_notes = uow.credit_note_item_repository.find_all(purchase_order_item_uuid=po_item.uuid, is_deleted=False)
        if credit_notes:
            raise BadRequestError("PurchaseOrder has credit notes")

        debit_notes = uow.debit_note_item_repository.find_all(purchase_order_item_uuid=po_item.uuid, is_deleted=False)
        if debit_notes:
            raise BadRequestError("PurchaseOrder has debit notes")

        inventory_events = uow.inventory_event_repository.find_all(purchase_order_item_uuid=po_item.uuid, is_deleted=False)
        if inventory_events:
            raise BadRequestError("PurchaseOrder has inventory events")
        # fixed assets
        fixed_assets = uow.fixed_asset_repository.find_all(purchase_order_item_uuid=po_item.uuid, is_deleted=False)
        if fixed_assets:
            raise BadRequestError("PurchaseOrder has fixed assets")




