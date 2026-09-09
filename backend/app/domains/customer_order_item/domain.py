from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.customer_order_item import CustomerOrderItemBulkCreate, CustomerOrderItemBulkRead, \
    CustomerOrderItemRead
from models.common import CustomerOrderItem as CustomerOrderItemModel

from app.entrypoint.routes.common.errors import NotFoundError

from app.dto.customer_order_item import CustomerOrderItemBulkFulfill
from app.dto.customer_order_item import FulfillItem, UnFulfillItem

from app.dto.customer_order_item import CustomerOrderItemBulkDelete
from app.domains.inventory_event.domain import InventoryEventDomain
from app.dto.inventory_event import InventoryEventCreate
from app.dto.inventory_event import InventoryEventType
from app.entrypoint.routes.common.errors import BadRequestError

from app.dto.customer_order_item import CustomerOrderItemBulkUnFulfill

from app.domains.inventory.domain import InventoryDomain
from app.dto.inventory import InventoryRead, InventoryFIFOOutput
from app.domains.vehicle_inventory.domain import VehicleInventoryDomain
from app.domains.vehicle_inventory_event.domain import VehicleInventoryEventDomain


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
        # current stop where fulfillment happens (e.g. a previously-created order
        # handed off during this trip); overrides the order's own stop for vehicle
        # attribution so the sale lands on the trip actually delivering it.
        override_stop = None
        if payload.trip_stop_uuid:
            override_stop = uow.trip_stop_repository.find_one(uuid=payload.trip_stop_uuid)
            if not override_stop:
                raise NotFoundError("TripStop not found")
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
                    quantity=abs(customer_order_item.quantity),
                    # A sale may overdraw. The goods left the van whether or not
                    # the books had caught up, and refusing the fulfilment would
                    # lose the record of something that already happened — the
                    # negative balance is the signal to go and reconcile.
                    # Naming an explicit lot (the branch above) has never
                    # checked availability either, so this makes the automatic
                    # path behave like the manual one.
                    allow_negative=True,
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

            # If this order is being delivered on a trip, also decrement the
            # vehicle's inventory (independent ledger; may go negative).
            order = customer_order_item.customer_order
            trip_stop = override_stop or (order.trip_stop if order else None)
            if trip_stop is not None and trip_stop.trip is not None:
                VehicleInventoryDomain.record_trip_sale(
                    uow=uow,
                    vehicle_uuid=trip_stop.trip.vehicle_uuid,
                    material_uuid=customer_order_item.material_uuid,
                    quantity=abs(customer_order_item.quantity),
                    customer_order_item_uuid=customer_order_item.uuid,
                    created_by_uuid=customer_order_item.created_by_uuid,
                    trip_stop_uuid=trip_stop.uuid,
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
            # reverse the warehouse stock this sale consumed. A FIFO sale can
            # span several lots, so there may be MORE THAN ONE sale event —
            # reverse every one, or a multi-lot line leaves stock stranded.
            inventory_events = [event for event in customer_order_item.inventory_events if not event.is_deleted and event.event_type == InventoryEventType.SALE.value]
            for ev in inventory_events:
                InventoryEventDomain.delete_inventory_event(uow=uow, uuid=ev.uuid)

            # reverse any vehicle 'sale' events created when this item was fulfilled on a trip
            vehicle_sale_events = [
                e for e in customer_order_item.vehicle_inventory_events
                if not e.is_deleted and e.event_type == "sale"
            ]
            for e in vehicle_sale_events:
                VehicleInventoryEventDomain.delete_event(uow=uow, uuid=e.uuid)

            items.append(customer_order_item)
        uow.customer_order_item_repository.batch_save(models=items, commit=False)
        bulk_read = CustomerOrderItemBulkRead(items=[CustomerOrderItemRead.from_orm(m) for m in items])
        return bulk_read


    @staticmethod
    def adjust_quantity(
        uow: SqlAlchemyUnitOfWork,
        uuid: str,
        new_quantity: int,
    ) -> CustomerOrderItemRead:
        """Change a line's ordered quantity. The invoice and order totals are
        derived hybrids off this column, so they recompute for free.

        Stock is not: a FULFILLED line has already drawn its quantity out of
        warehouse (and, on a trip, vehicle) stock as sale events that snapshot
        the old figure. So for a fulfilled line we reverse those events and
        re-fulfil at the new quantity — reusing the unfulfil/fulfil machinery so
        FIFO lot selection and vehicle attribution follow the exact same rules
        as the original sale. An unfulfilled line has moved no stock, so setting
        the column is all it takes. Payment state is the caller's gate (this is
        only reached for a fully unpaid order), so no payment ever moves.
        """
        coi = uow.customer_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not coi:
            raise NotFoundError("CustomerOrderItem not found")

        was_fulfilled = coi.is_fulfilled
        trip_stop_uuid = None
        if was_fulfilled:
            # remember which stop the vehicle sale was attributed to, so the
            # re-fulfilment lands the new sale on the same trip/vehicle
            veh_sales = [
                e for e in coi.vehicle_inventory_events
                if not e.is_deleted and e.event_type == "sale"
            ]
            trip_stop_uuid = veh_sales[0].trip_stop_uuid if veh_sales else None
            CustomerOrderItemDomain.unfulfill_items(
                uow=uow,
                payload=CustomerOrderItemBulkUnFulfill(
                    items=[UnFulfillItem(customer_order_item_uuid=uuid)]
                ),
            )

        coi.quantity = new_quantity
        uow.customer_order_item_repository.save(model=coi, commit=False)
        # flush so the re-fulfilment's FIFO query sees the restored lot balances
        uow.session.flush()

        if was_fulfilled:
            CustomerOrderItemDomain.fulfill_items(
                uow=uow,
                payload=CustomerOrderItemBulkFulfill(
                    items=[FulfillItem(customer_order_item_uuid=uuid)],
                    trip_stop_uuid=trip_stop_uuid,
                ),
            )

        fresh = uow.customer_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        return CustomerOrderItemRead.from_orm(fresh)

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

