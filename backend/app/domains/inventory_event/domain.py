
# -*- coding: utf-8 -*-
"""Inventory Event Domain."""
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import InventoryEvent as InventoryEventModel
from app.dto.inventory_event import InventoryEventCreate, InventoryEventRead
from app.entrypoint.routes.common.errors import BadRequestError
from app.entrypoint.routes.common.errors import NotFoundError
from app.dto.inventory_event import InventoryEventType

from app.domains.inventory_event.event_handler import InventoryEventHandlerEntryPoint


class InventoryEventDomain:

    @staticmethod
    def create_inventory_event(uow: SqlAlchemyUnitOfWork, payload: InventoryEventCreate) -> InventoryEventRead:
        """Create an inventory event."""
        event_read = InventoryEventHandlerEntryPoint().handle_event(uow=uow, event=payload)
        return event_read


    @staticmethod
    def delete_inventory_event(uow: SqlAlchemyUnitOfWork, uuid: str) -> InventoryEventRead:
        event = uow.inventory_event_repository.find_one(uuid=uuid, is_deleted=False)
        if not event:
            raise NotFoundError("InventoryEvent not found")
        if event.event_type != InventoryEventType.MANUAL.value:
            raise BadRequestError("cannot delete this event")
        event_read = InventoryEventHandlerEntryPoint().delete_event(uow=uow, event=event)
        return event_read

    @staticmethod
    def validate_relations(uow: SqlAlchemyUnitOfWork, event: InventoryEventModel):
        # all must not be delted
        if event.purchase_order_item_uuid:
            purchase_order_item = uow.purchase_order_item_repository.find_one(uuid=event.purchase_order_item_uuid, is_deleted=False)
            if not purchase_order_item:
                raise NotFoundError("Purchase Order Item not found")
        if event.customer_order_item_uuid:
            customer_order_item = uow.customer_order_item_repository.find_one(uuid=event.customer_order_item_uuid, is_deleted=False)
            if not customer_order_item:
                raise NotFoundError("Customer Order Item not found")
        if event.debit_note_item_uuid:
            debit_note_item = uow.debit_note_item_repository.find_one(uuid=event.debit_note_item_uuid, is_deleted=False)
            if not debit_note_item:
                raise NotFoundError("Debit Note Item not found")
        if event.credit_note_item_uuid:
            credit_note_item = uow.credit_note_item_repository.find_one(uuid=event.credit_note_item_uuid, is_deleted=False)
            if not credit_note_item:
                raise NotFoundError("Credit Note Item not found")

        if event.process_uuid:
            process = uow.process_repository.find_one(uuid=event.process_uuid, is_deleted=False)
            if not process:
                raise BadRequestError("Process not found")