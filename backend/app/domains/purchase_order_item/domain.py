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
from app.dto.purchase_order_item import PurchaseOrderItemEdit
from models.common import MONEY_TOLERANCE


class PurchaseOrderItemDomain:

    @staticmethod
    def edit_item(uow: SqlAlchemyUnitOfWork, po_item: PurchaseOrderItemModel, edit: PurchaseOrderItemEdit) -> None:
        """Correct what a line ordered, or what it cost, after the fact.

        The price needs nothing beyond its column: a lot's cost per unit is
        computed on read from its PO item's adjusted price, so every lot this
        line stocked re-costs itself.

        The quantity is also what fulfillment received, so the receipt follows
        it: quantity_received, and the line's one PURCHASE_ORDER inventory
        event, are edited IN PLACE. Not a compensating adjustment — the receipt
        itself was wrong, and one PO event per line is what unfulfill (and the
        credit/debit notes, which look up "the" event) rely on. Lowering it
        below what the lot has already given out takes the lot negative, the
        same as an oversale does.

        A fixed asset bought on this line copied its price and quantity when it
        was created. Each figure follows the edit only while it still equals
        the line's old value, so a hand edit on the asset survives.
        """
        old_quantity = po_item.quantity
        old_price = po_item.price_per_unit
        adjusted_quantity_before = po_item.adjusted_quantity
        adjusted_total_before = po_item.adjusted_total_price

        if edit.price_per_unit is not None:
            po_item.price_per_unit = edit.price_per_unit

        if edit.quantity is not None and edit.quantity != old_quantity:
            po_item.quantity = edit.quantity
            if po_item.is_fulfilled:
                # fulfilment is all-or-nothing, so a fulfilled line received
                # exactly what it ordered
                po_item.quantity_received = edit.quantity
            receipts = [
                event for event in po_item.inventory_events
                if not event.is_deleted and event.event_type == InventoryEventType.PURCHASE_ORDER.value
            ]
            if len(receipts) > 1:
                raise BadRequestError("PO inventory event count is not 1")
            for event in receipts:
                event.quantity = edit.quantity
                uow.inventory_event_repository.save(model=event, commit=False)

        # credit/debit notes adjust the line on top of these figures; a
        # correction may not leave it returning more than it ordered, or
        # credited for more than it cost — unless it was already, and the
        # correction does not make it worse
        notes_quantity = po_item.adjusted_quantity - po_item.quantity
        if po_item.adjusted_quantity < 0 and po_item.adjusted_quantity < adjusted_quantity_before:
            raise BadRequestError(
                f"Quantity can't go below {-notes_quantity:g}: that much has "
                f"already been returned on this line's credit/debit notes"
            )
        if po_item.adjusted_total_price < -MONEY_TOLERANCE and po_item.adjusted_total_price < adjusted_total_before:
            raise BadRequestError(
                f"The line's new total ({po_item.total_price:g} {po_item.currency}) "
                f"is less than the {po_item.total_price - po_item.adjusted_total_price:g} "
                f"its credit/debit notes already take off it"
            )

        fixed_assets = uow.fixed_asset_repository.find_all(purchase_order_item_uuid=po_item.uuid, is_deleted=False)
        for fixed_asset in fixed_assets:
            if fixed_asset.price_per_unit == old_price:
                fixed_asset.price_per_unit = po_item.price_per_unit
            if fixed_asset.quantity == old_quantity:
                fixed_asset.quantity = po_item.quantity
            uow.fixed_asset_repository.save(model=fixed_asset, commit=False)

        uow.purchase_order_item_repository.save(model=po_item, commit=False)

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
            # Fulfilment is all-or-nothing here — there is no partial receipt —
            # so a fulfilled line has received exactly what was ordered. Record
            # it, or the Received column reads 0 next to a green Fulfilled badge.
            po_item.quantity_received = po_item.quantity
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
            # nothing is received once the line is un-fulfilled
            po_item.quantity_received = 0.0
            items.append(po_item)

            # Undo whatever stock the fulfillment created. At most one PO event
            # can exist per item — but NONE is legitimate: machinery/vehicle
            # purchases never stock inventory, and items fulfilled while the
            # handler only covered raw materials have nothing to undo (this
            # tolerance is also the only way to unstick those).
            inventory_events = [event for event in po_item.inventory_events if not event.is_deleted and event.event_type == InventoryEventType.PURCHASE_ORDER.value]
            if len(inventory_events) > 1:
                raise BadRequestError("PO inventory event count is not 1")
            if not inventory_events:
                continue

            InventoryEventDomain.delete_inventory_event(
                uow=uow,
                uuid=inventory_events[0].uuid

            )

            uow.inventory_event_repository.save(model=inventory_events[0], commit=False)

            # delete inventory entry if no event are attached, else raise exception
            inventory = uow.inventory_repository.find_one(uuid=inventory_events[0].inventory_uuid, is_deleted=False)
            if not inventory:
                raise NotFoundError("Inventory not found")
            if len(inventory.inventory_events) == 0:
                # otherewise the PO was added to existing inventory
                InventoryDomain.delete_inventory(
                    uow=uow,
                    uuid=inventory_events[0].inventory_uuid
                )

        uow.purchase_order_item_repository.batch_save(models=items, commit=False)
        return [PurchaseOrderItemRead.from_orm(po_item) for po_item in items]



    @staticmethod
    def resolve_currency_and_unit(uow: SqlAlchemyUnitOfWork, item: PurchaseOrderItemCreate) -> None:
        """Fill the two NOT NULL columns the caller does not own.

        `currency` belongs to the ORDER — one order, one currency — so it is
        always taken from the parent, never from the item, even when the item
        carries one. `unit` belongs to the MATERIAL; a supplied unit is only
        allowed to agree with it.

        Called on every create path, so no route can leave either column NULL
        and have the database report it as a bogus 409 conflict.
        """
        material = uow.material_repository.find_one(uuid=item.material_uuid, is_deleted=False)
        if not material:
            raise NotFoundError("Material not found")

        if item.unit and item.unit != material.measure_unit:
            raise BadRequestError(
                f"Invalid unit: {item.unit}. Expected: {material.measure_unit}"
            )
        item.unit = material.measure_unit

        if not item.purchase_order_uuid:
            raise BadRequestError("purchase_order_uuid is required")
        po = uow.purchase_order_repository.find_one(
            uuid=item.purchase_order_uuid, is_deleted=False
        )
        if not po:
            raise NotFoundError("Purchase order not found")
        item.currency = po.currency

    @staticmethod
    def create_items(uow: SqlAlchemyUnitOfWork, items: list[PurchaseOrderItemCreate]) -> list[PurchaseOrderItemRead]:
        """
        Create purchase order items.
        """
        created_models = []
        for item in items:
            PurchaseOrderItemDomain.resolve_currency_and_unit(uow=uow, item=item)
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
    def delete_item(uow: SqlAlchemyUnitOfWork, uuid: str) -> PurchaseOrderItemRead:
        """Soft-delete one line that has not yet moved stock or money.

        Removing a line lowers the order's total, and payouts cannot be edited,
        so the line may not take the order below what has been paid out on it —
        the same rule PurchaseOrderDomain.edit_items applies to a correction.
        Only a removal that makes the amount due worse is refused, so a free
        line can still go from an order that is already overpaid.
        """
        po_item = uow.purchase_order_item_repository.find_one(uuid=uuid, is_deleted=False)
        if not po_item:
            raise NotFoundError("PurchaseOrderItem not found")

        PurchaseOrderItemDomain.validate_po_item_delete(uow=uow, po_item=po_item)
        po = po_item.purchase_order
        due_before = po.net_amount_due
        po_item.is_deleted = True
        if po.net_amount_due < -MONEY_TOLERANCE and po.net_amount_due < due_before:
            raise BadRequestError(
                f"Without this line the order's total ({po.total_adjusted_amount:g} {po.currency}) "
                f"is less than the {po.net_amount_paid:g} already paid out on it — remove a payout first"
            )
        uow.purchase_order_item_repository.save(model=po_item, commit=False)
        return PurchaseOrderItemRead.from_orm(po_item)


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




