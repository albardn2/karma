from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.common.errors import BadRequestError
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork

from app.dto.credit_note_item import CreditNoteItemRead
from app.dto.credit_note_item import CreditNoteItemCreate
from models.common import CreditNoteItem as CreditNoteItemModel

from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventCreate, InventoryEventType
from app.dto.invoice import InvoiceStatus


class CreditNoteItemDomain:
    @staticmethod
    def create_item(uow: SqlAlchemyUnitOfWork, payload: CreditNoteItemCreate) -> CreditNoteItemRead:


        item = CreditNoteItemModel(**payload.model_dump(mode="json"))
        # item.status = InvoiceStatus.PENDING.value
        uow.credit_note_item_repository.save(model=item, commit=False)

        if item.invoice_item_uuid:
            invoice_item = uow.invoice_item_repository.find_one(uuid=item.invoice_item_uuid, is_deleted=False)
            if not invoice_item:
                raise NotFoundError("InvoiceItem not found")
            item.customer_uuid = invoice_item.invoice.customer_uuid
            item.customer_order_item_uuid = invoice_item.customer_order_item_uuid
            if item.amount > invoice_item.total_price or item.currency != invoice_item.currency:
                raise BadRequestError("CreditNoteItem amount and currency must match InvoiceItem")

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
                    credit_note_item_uuid=item.uuid,
                    inventory_uuid=inventory_uuid,
                    affect_original=False
                )
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
                raise BadRequestError("CreditNoteItem amount and currency must match PurchaseOrderItem")

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
                    credit_note_item_uuid=item.uuid,
                    inventory_uuid=inventory_uuid,
                    affect_original=True
                )
                event_read = InventoryEventDomain.create_inventory_event(
                    uow=uow,
                    payload=payload
                )

        return CreditNoteItemRead.from_orm(item)


    @staticmethod
    def delete_item(uow: SqlAlchemyUnitOfWork, uuid: str) -> CreditNoteItemRead:
        m = uow.credit_note_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not m:
            raise NotFoundError("CreditNoteItem not found")

        payouts = uow.payout_repository.find_all(credit_note_item_uuid=m.uuid, is_deleted=False)
        if payouts:
            raise BadRequestError("CreditNoteItem cannot be deleted, it has payouts")
        inv_events = uow.inventory_event_repository.find_all(credit_note_item_uuid=m.uuid, is_deleted=False)
        if inv_events:
            raise BadRequestError("CreditNoteItem cannot be deleted, it has inventory events")

        m.is_deleted = True
        uow.credit_note_item_repository.save(model=m, commit=False)
        return CreditNoteItemRead.from_orm(m)