from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.vehicle_inventory_event import (
    VehicleInventoryEventCreate,
    VehicleInventoryEventRead,
    VehicleInventoryEventType,
)
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from models.common import VehicleInventoryEvent as VehicleInventoryEventModel


class VehicleInventoryEventDomain:

    @staticmethod
    def _signed_delta(event_type: VehicleInventoryEventType, quantity: float) -> float:
        """Convert the user-entered magnitude into the signed delta to store."""
        if event_type == VehicleInventoryEventType.MANUAL:
            return abs(quantity)
        if event_type in (VehicleInventoryEventType.UNLOAD, VehicleInventoryEventType.SALE):
            return -abs(quantity)
        # adjustment: signed as given
        return quantity

    @staticmethod
    def create_event(
        uow: SqlAlchemyUnitOfWork,
        payload: VehicleInventoryEventCreate,
        allow_negative: bool = False,
    ) -> VehicleInventoryEventRead:
        inventory = uow.vehicle_inventory_repository.find_one(
            uuid=payload.vehicle_inventory_uuid, is_deleted=False
        )
        if not inventory:
            raise NotFoundError("Vehicle inventory not found")

        delta = VehicleInventoryEventDomain._signed_delta(payload.event_type, payload.quantity)

        # By default a vehicle's stock cannot be DRIVEN negative; trip sales may
        # override. Only decrements are gated: an already-overdrawn van (trip
        # sales are allowed to do that) must still accept stock being loaded onto
        # it. Testing the resulting balance alone refused a load of 3 onto a van
        # at -10, because -10 + 3 is still negative — leaving the operator to
        # either not record what they loaded or enter a quantity they know is
        # false. A load can only ever improve the balance.
        if not allow_negative and delta < 0 and inventory.current_quantity + delta < 0:
            raise BadRequestError(
                f"Insufficient vehicle stock: balance {inventory.current_quantity}, "
                f"requested change {delta}"
            )

        data = payload.model_dump(mode="json")
        data["quantity"] = delta  # store the signed delta
        event_model = VehicleInventoryEventModel(**data)
        event_model.material_uuid = inventory.material_uuid
        uow.vehicle_inventory_event_repository.save(model=event_model, commit=False)
        return VehicleInventoryEventRead.from_orm(event_model)

    @staticmethod
    def delete_event(uow: SqlAlchemyUnitOfWork, uuid: str) -> VehicleInventoryEventRead:
        event_model = uow.vehicle_inventory_event_repository.find_one(uuid=uuid, is_deleted=False)
        if not event_model:
            raise NotFoundError("Vehicle inventory event not found")

        inventory = uow.vehicle_inventory_repository.find_one(
            uuid=event_model.vehicle_inventory_uuid, is_deleted=False
        )
        # Deleting an event removes its delta from the balance, so only removing
        # a POSITIVE delta (a load) can make things worse — and refusing that is
        # right, since the stock may since have been sold.
        #
        # Removing a NEGATIVE delta raises the balance and must never be blocked:
        # a sale is stored as a negative delta, so the old sign-blind test made
        # an overdrawn van unrepairable. Unfulfilling an order reverses the
        # warehouse ledger first and then lands here in the same transaction, so
        # this raising rolled the entire unfulfil back — and with a -70 balance
        # made of a -40 and a -30, every individual reversal was refused, in any
        # order. The admin DELETE endpoint hit the same wall.
        if (
            inventory
            and event_model.quantity > 0
            and (inventory.current_quantity - event_model.quantity) < 0
        ):
            raise BadRequestError(
                "Deleting this event would make the vehicle stock negative"
            )

        event_model.is_deleted = True
        uow.vehicle_inventory_event_repository.save(model=event_model, commit=False)
        return VehicleInventoryEventRead.from_orm(event_model)
