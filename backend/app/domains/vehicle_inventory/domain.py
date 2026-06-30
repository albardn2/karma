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
