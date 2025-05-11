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
            customer_order_item.is_fulfilled = True
            customer_order_item.fulfilled_at = datetime.now()
            # create inventory event
            InventoryEventDomain.create_inventory_event(
                uow=uow,
                payload=InventoryEventCreate(
                    quantity=-(abs(customer_order_item.quantity)),
                    event_type=InventoryEventType.SALE,
                    inventory_uuid=item.inventory_uuid,
                    customer_order_item_uuid=customer_order_item.uuid
                )
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
            m.is_deleted = True
            items.append(m)
        uow.customer_order_item_repository.batch_save(models=items, commit=False)
        bulk_read = CustomerOrderItemBulkRead(items=[CustomerOrderItemRead.from_orm(m) for m in items])
        return bulk_read
