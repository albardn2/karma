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

        # by default a vehicle's stock cannot go negative; trip sales may override
        if not allow_negative and inventory.current_quantity + delta < 0:
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
        # deleting an event removes its delta from the balance; guard against negative
        if inventory and (inventory.current_quantity - event_model.quantity) < 0:
            raise BadRequestError(
                "Deleting this event would make the vehicle stock negative"
            )

        event_model.is_deleted = True
        uow.vehicle_inventory_event_repository.save(model=event_model, commit=False)
        return VehicleInventoryEventRead.from_orm(event_model)
