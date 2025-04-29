
# -*- coding: utf-8 -*-
"""Inventory Event Domain."""
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from models.common import InventoryEvent as InventoryEventModel
from app.dto.inventory_event import InventoryEventCreate, InventoryEventRead

from app.entrypoint.routes.common.errors import BadRequestError

from app.entrypoint.routes.common.errors import NotFoundError


class InventoryEventDomain:

    @staticmethod
    def create_inventory_event(uow: SqlAlchemyUnitOfWork, payload: InventoryEventCreate) -> InventoryEventRead:
        """Create an inventory event."""
        event = InventoryEventModel(**payload.model_dump(mode='json'))
        # check inventory_uuid exists
        inventory = uow.inventory_repository.find_one(uuid=event.inventory_uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError("Inventory not found")

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

        # todo: logic per event type
        inventory.current_quantity += event.quantity
        event.material_uuid = inventory.material_uuid
        uow.inventory_event_repository.save(model=event)
        return InventoryEventRead.from_orm(event)


    @staticmethod
    def delete_inventory_event(uow: SqlAlchemyUnitOfWork, uuid: str) -> InventoryEventRead:
        event = uow.inventory_event_repository.find_one(uuid=uuid, is_deleted=False)
        if not event:
            raise NotFoundError("InventoryEvent not found")
        event.is_deleted = True

        inventory = event.inventory
        inventory.current_quantity -= event.quantity
        uow.inventory_event_repository.save(model=event)
        return InventoryEventRead.from_orm(event)