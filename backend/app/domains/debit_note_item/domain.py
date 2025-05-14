from models.common import DebitNoteItem as DebitNoteItemModel
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError
from app.dto.debit_note_item import DebitNoteItemRead, DebitNoteItemCreate, DebitNoteItemUpdate
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.dto.invoice import InvoiceStatus
from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventType, InventoryEventCreate


class DebitNoteItemDomain:

    @staticmethod
    def create_item(uow: SqlAlchemyUnitOfWork, payload: DebitNoteItemCreate) -> DebitNoteItemRead:


        item = DebitNoteItemModel(**payload.model_dump(mode="json"))
        item.status = InvoiceStatus.PENDING.value
        uow.debit_note_item_repository.save(model=item, commit=False)

        if item.invoice_item_uuid:
            invoice_item = uow.invoice_item_repository.find_one(uuid=item.invoice_item_uuid, is_deleted=False)
            if not invoice_item:
                raise NotFoundError("InvoiceItem not found")
            item.customer_uuid = invoice_item.invoice.customer_uuid
            item.customer_order_item_uuid = invoice_item.customer_order_item_uuid
            if item.amount > invoice_item.total_price or item.currency != invoice_item.currency:
                raise BadRequestError("DebitNoteItem amount and currency must match InvoiceItem")

            if item.inventory_change:
                inventory_event = uow.inventory_event_repository.find_first(customer_order_item_uuid=item.customer_order_item_uuid,
                                                                            event_type = InventoryEventType.SALE.value,
                                                                            is_deleted=False)
                if not inventory_event:
                    raise NotFoundError("InventoryEvent not found")

                inventory_uuid = inventory_event.inventory_uuid
                if not inventory_uuid:
                    raise NotFoundError("Inventory not found")
                payload =InventoryEventCreate(
                    quantity=item.inventory_change,
                    event_type=InventoryEventType.ADJUSTMENT,
                    customer_order_item_uuid=item.customer_order_item_uuid,
                    debit_note_item_uuid=item.uuid,
                    inventory_uuid=inventory_uuid)
                event_read = InventoryEventDomain.create_inventory_event(
                    uow=uow,
                    payload=payload
                )

        if item.purchase_order_item_uuid:
            purchase_order_item = uow.purchase_order_item_repository.find_one(uuid=item.purchase_order_item_uuid, is_deleted=False)
            if not purchase_order_item:
                raise NotFoundError("PurchaseOrderItem not found")

            item.vendor_uuid = purchase_order_item.purchase_order.vendor_uuid
            if item.amount > purchase_order_item.total_price or item.currency != purchase_order_item.currency:
                raise BadRequestError("DebitNoteItem amount and currency must match PurchaseOrderItem")

            if item.inventory_change:
                inventory_event = uow.inventory_event_repository.find_first(purchase_order_item_uuid=item.purchase_order_item_uuid,
                                                                            event_type = InventoryEventType.PURCHASE_ORDER.value,
                                                                            is_deleted=False)
                if not inventory_event:
                    raise NotFoundError("InventoryEvent not found")
                inventory_uuid = inventory_event.inventory_uuid
                if not inventory_uuid:
                    raise NotFoundError("Inventory not found")

                payload =InventoryEventCreate(
                    quantity=item.inventory_change,
                    event_type=InventoryEventType.ADJUSTMENT,
                    purchase_order_item_uuid=item.purchase_order_item_uuid,
                    debit_note_item_uuid=item.uuid,
                    inventory_uuid=inventory_uuid)
                event_read = InventoryEventDomain.create_inventory_event(
                    uow=uow,
                    payload=payload
                )

        return DebitNoteItemRead.from_orm(item)


    @staticmethod
    def delete_item(uow: SqlAlchemyUnitOfWork, uuid: str) -> DebitNoteItemRead:
        m = uow.debit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("DebitNoteItem not found")

        payment = uow.payment_repository.find_all(debit_note_item_uuid=m.uuid, is_deleted=False)
        if payment:
            raise BadRequestError("DebitNoteItem cannot be deleted, it has payment")
        inv_events = uow.inventory_event_repository.find_all(debit_note_item_uuid=m.uuid, is_deleted=False)
        if inv_events:
            raise BadRequestError("DebitNoteItem cannot be deleted, it has inventory events")

        m.is_deleted = True
        uow.debit_note_item_repository.save(model=m, commit=False)
        return DebitNoteItemRead.from_orm(m)