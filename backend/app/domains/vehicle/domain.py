from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from models.common import Vehicle as VehicleModel
from app.dto.vehicle import VehicleCreate, VehicleRead, VehicleUpdate, VehicleListParams, VehiclePage

class VehicleDomain:

    @staticmethod
    def create_vehicle(uow: SqlAlchemyUnitOfWork, payload: VehicleCreate) -> VehicleRead:
        data = payload.model_dump()
        vehicle = VehicleModel(**data)
        uow.vehicle_repository.save(model=vehicle, commit=False)
        return VehicleRead.from_orm(vehicle)

    @staticmethod
    def update_vehicle(uow: SqlAlchemyUnitOfWork, uuid: str, payload: VehicleUpdate) -> VehicleRead:
        vehicle = uow.vehicle_repository.find_one(uuid=uuid, is_deleted=False)
        if not vehicle:
            raise NotFoundError('Vehicle not found')

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(vehicle, field, val)
        uow.vehicle_repository.save(model=vehicle, commit=False)
        return VehicleRead.from_orm(vehicle)

    @staticmethod
    def delete_vehicle(uow: SqlAlchemyUnitOfWork, uuid: str) -> VehicleRead:
        vehicle = uow.vehicle_repository.find_one(uuid=uuid, is_deleted=False)
        if not vehicle:
            raise NotFoundError('Vehicle not found')

        vehicle.is_deleted = True
        uow.vehicle_repository.save(model=vehicle, commit=False)
        return VehicleRead.from_orm(vehicle)

