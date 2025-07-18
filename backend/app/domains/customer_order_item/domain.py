from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.customer_order_item import CustomerOrderItemBulkCreate, CustomerOrderItemBulkRead, \
    CustomerOrderItemRead
from models.common import CustomerOrderItem as CustomerOrderItemModel

from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.customer_order_item import CustomerOrderItemBulkFulfill

from app.dto.customer_order_item import CustomerOrderItemBulkDelete
from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventCreate
from app.dto.inventory_event import InventoryEventType
from app.entrypoint.routes.common.errors import BadRequestError

from app.dto.customer_order_item import CustomerOrderItemBulkUnFulfill

from app.domains.inventory.domain import InventoryDomain
from app.dto.inventory import InventoryRead, InventoryFIFOOutput


class CustomerOrderItemDomain:

    @staticmethod
    def create_items(
        uow: SqlAlchemyUnitOfWork,
        payload: CustomerOrderItemBulkCreate
    ) -> CustomerOrderItemBulkRead:
        items = []
        for item_pl in payload.items:
            data = item_pl.model_dump(mode='json')
            m = CustomerOrderItemModel(**data)
            material = uow.material_repository.find_one(uuid=data['material_uuid'],is_deleted=False)
            if not material:
                raise NotFoundError("Material not found")
            m.unit = material.measure_unit
            items.append(m)
        uow.customer_order_item_repository.batch_save(models=items, commit=False)
        bulk_read = CustomerOrderItemBulkRead(items=[CustomerOrderItemRead.from_orm(m) for m in items])
        return bulk_read

    @staticmethod
    def fulfill_items(
        uow: SqlAlchemyUnitOfWork,
        payload: CustomerOrderItemBulkFulfill
    ) -> CustomerOrderItemBulkRead:
        items = []
        for item in payload.items:
            customer_order_item = uow.customer_order_item_repository.find_one(uuid=item.customer_order_item_uuid, is_deleted=False)
            if not customer_order_item:
                raise NotFoundError("CustomerOrderItem not found")
            if customer_order_item.is_fulfilled:
                raise BadRequestError("CustomerOrderItem already fulfilled")
            customer_order_item.is_fulfilled = True
            customer_order_item.fulfilled_at = datetime.now()
            # create inventory event

            if item.inventory_uuid:
                inventories = [InventoryFIFOOutput(
                    inventory_uuid=item.inventory_uuid,
                    quantity=abs(customer_order_item.quantity),
                    material_uuid=customer_order_item.material_uuid
                )]
            else:
                inventories: list[InventoryFIFOOutput] = InventoryDomain.get_fifo_inventories_for_material(
                    uow=uow,
                    material_uuid=customer_order_item.material_uuid,
                    quantity=abs(customer_order_item.quantity)
                )

            for inv in inventories:
                InventoryEventDomain.create_inventory_event(
                    uow=uow,
                    payload=InventoryEventCreate(
                        quantity=-(abs(inv.quantity)),
                        event_type=InventoryEventType.SALE,
                        inventory_uuid=inv.inventory_uuid,
                        customer_order_item_uuid=customer_order_item.uuid,
                        affect_original=False
                    )
                )
            items.append(customer_order_item)
        uow.customer_order_item_repository.batch_save(models=items, commit=False)
        bulk_read = CustomerOrderItemBulkRead(items=[CustomerOrderItemRead.from_orm(m) for m in items])
        return bulk_read

    @staticmethod
    def unfulfill_items(
            uow: SqlAlchemyUnitOfWork,
            payload: CustomerOrderItemBulkUnFulfill
    ) -> CustomerOrderItemBulkRead:
        items = []
        for item in payload.items:
            customer_order_item = uow.customer_order_item_repository.find_one(uuid=item.customer_order_item_uuid, is_deleted=False)
            if not customer_order_item:
                raise NotFoundError("CustomerOrderItem not found")
            if not customer_order_item.is_fulfilled:
                raise BadRequestError("CustomerOrderItem is not fulfilled")
            customer_order_item.is_fulfilled = False
            customer_order_item.fulfilled_at = None
            # create inventory event
            inventory_events = [event for event in customer_order_item.inventory_events if not event.is_deleted and event.event_type == InventoryEventType.SALE.value]
            InventoryEventDomain.delete_inventory_event(
                uow=uow,
                uuid=inventory_events[0].uuid

            )
            items.append(customer_order_item)
        uow.customer_order_item_repository.batch_save(models=items, commit=False)
        bulk_read = CustomerOrderItemBulkRead(items=[CustomerOrderItemRead.from_orm(m) for m in items])
        return bulk_read


    @staticmethod
    def delete_items(
        uow: SqlAlchemyUnitOfWork,
        payload: CustomerOrderItemBulkDelete
    ) -> CustomerOrderItemBulkRead:
        items = []
        for item_uuid in payload.uuids:
            m = uow.customer_order_item_repository.find_one(uuid=item_uuid, is_deleted=False)
            if not m:
                raise NotFoundError("CustomerOrderItem not found")
            CustomerOrderItemDomain.validate_item_delete(item=m)
            m.is_deleted = True
            items.append(m)
        uow.customer_order_item_repository.batch_save(models=items, commit=False)
        bulk_read = CustomerOrderItemBulkRead(items=[CustomerOrderItemRead.from_orm(m) for m in items])
        return bulk_read

    @staticmethod
    def validate_item_delete(
        item: CustomerOrderItemModel
    ):
        if item.is_fulfilled:
            raise BadRequestError("cannot delete fulfilled item")

        events = [event for event in item.inventory_events if not event.is_deleted]
        if events:
            raise BadRequestError(
                f"CustomerOrderItem {item.uuid} cannot be deleted because it is referenced by inventory events"
            )

