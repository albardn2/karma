from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.vehicle_inventory import VehicleInventoryCreate, VehicleInventoryRead
from app.entrypoint.routes.common.errors import NotFoundError, BadRequestError
from models.common import VehicleInventory as VehicleInventoryModel


class VehicleInventoryDomain:

    @staticmethod
    def create_vehicle_inventory(uow: SqlAlchemyUnitOfWork, payload: VehicleInventoryCreate) -> VehicleInventoryRead:
        vehicle = uow.vehicle_repository.find_one(uuid=payload.vehicle_uuid, is_deleted=False)
        if not vehicle:
            raise NotFoundError("Vehicle not found")

        material = uow.material_repository.find_one(uuid=payload.material_uuid, is_deleted=False)
        if not material:
            raise NotFoundError("Material not found")

        # one active stock row per (vehicle, material)
        existing = uow.vehicle_inventory_repository.find_first(
            vehicle_uuid=payload.vehicle_uuid,
            material_uuid=payload.material_uuid,
            is_deleted=False,
        )
        if existing:
            raise BadRequestError(
                "Vehicle inventory already exists for this vehicle and material"
            )

        inventory = VehicleInventoryModel(**payload.model_dump(mode="json"))
        inventory.unit = material.measure_unit
        uow.vehicle_inventory_repository.save(model=inventory, commit=False)
        return VehicleInventoryRead.from_orm(inventory)

    @staticmethod
    def get_or_create_inventory(
        uow: SqlAlchemyUnitOfWork,
        vehicle_uuid: str,
        material_uuid: str,
        created_by_uuid: str = None,
    ) -> VehicleInventoryModel:
        """Return the active (vehicle, material) inventory row, creating it if absent."""
        inv = uow.vehicle_inventory_repository.find_first(
            vehicle_uuid=vehicle_uuid, material_uuid=material_uuid, is_deleted=False
        )
        if inv:
            return inv
        material = uow.material_repository.find_one(uuid=material_uuid, is_deleted=False)
        inv = VehicleInventoryModel(
            vehicle_uuid=vehicle_uuid,
            material_uuid=material_uuid,
            created_by_uuid=created_by_uuid,
            unit=material.measure_unit if material else None,
            is_active=True,
        )
        uow.vehicle_inventory_repository.save(model=inv, commit=False)
        return inv

    @staticmethod
    def balances_for_vehicle(uow: SqlAlchemyUnitOfWork, vehicle_uuid: str) -> dict:
        """Snapshot of the vehicle's current per-material balances ({material_uuid: qty})."""
        rows = uow.vehicle_inventory_repository.find_all(vehicle_uuid=vehicle_uuid, is_deleted=False)
        return {r.material_uuid: r.current_quantity for r in rows}

    @staticmethod
    def record_trip_sale(
        uow: SqlAlchemyUnitOfWork,
        vehicle_uuid: str,
        material_uuid: str,
        quantity: float,
        customer_order_item_uuid: str,
        created_by_uuid: str = None,
    ):
        """Decrement the vehicle's stock of a material for a fulfilled trip-stop order item.
        Auto-creates the inventory row if missing and may push the balance negative."""
        from app.domains.vehicle_inventory_event.domain import VehicleInventoryEventDomain
        from app.dto.vehicle_inventory_event import VehicleInventoryEventCreate, VehicleInventoryEventType

        inv = VehicleInventoryDomain.get_or_create_inventory(
            uow=uow, vehicle_uuid=vehicle_uuid, material_uuid=material_uuid, created_by_uuid=created_by_uuid
        )
        return VehicleInventoryEventDomain.create_event(
            uow=uow,
            payload=VehicleInventoryEventCreate(
                vehicle_inventory_uuid=inv.uuid,
                event_type=VehicleInventoryEventType.SALE,
                quantity=abs(quantity),
                customer_order_item_uuid=customer_order_item_uuid,
                created_by_uuid=created_by_uuid,
            ),
            allow_negative=True,
        )

    @staticmethod
    def delete_vehicle_inventory(uow: SqlAlchemyUnitOfWork, uuid: str) -> VehicleInventoryRead:
        inventory = uow.vehicle_inventory_repository.find_one(uuid=uuid, is_deleted=False)
        if not inventory:
            raise NotFoundError("Vehicle inventory not found")

        events = uow.vehicle_inventory_event_repository.find_all(
            vehicle_inventory_uuid=inventory.uuid,
            is_deleted=False,
        )
        if events:
            raise BadRequestError("Vehicle inventory has events, cannot be deleted")

        inventory.is_deleted = True
        uow.vehicle_inventory_repository.save(model=inventory, commit=False)
        return VehicleInventoryRead.from_orm(inventory)
