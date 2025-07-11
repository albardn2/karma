from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from models.common import ServiceArea as ServiceAreaModel
from app.dto.service_area import ServiceAreaRead, ServiceAreaCreate
from geoalchemy2 import WKTElement
from app.dto.service_area import ServiceAreaUpdate


class ServiceAreaDomain:

    @staticmethod
    def create_service_area(uow: SqlAlchemyUnitOfWork, payload: ServiceAreaCreate) -> ServiceAreaRead:
        data = payload.model_dump(exclude={"geometry"})
        geometry = WKTElement(payload.geometry, srid=4326)
        service_area = ServiceAreaModel(**data)
        service_area.geometry = geometry
        uow.service_area_repository.save(model=service_area, commit=False)
        return ServiceAreaRead.from_orm(service_area)

    @staticmethod
    def update_service_area(uow: SqlAlchemyUnitOfWork, uuid: str, payload: ServiceAreaUpdate) -> ServiceAreaRead:
        service_area = uow.service_area_repository.find_one(uuid=uuid, is_deleted=False)
        if not service_area:
            raise NotFoundError('service_area not found')

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            if field == 'geometry':
                print(f"Updating geometry for service area {uuid} with value: {val}")
                setattr(service_area, field, WKTElement(val, srid=4326))
            else:
                setattr(service_area, field, val)
        uow.service_area_repository.save(model=service_area, commit=False)
        return ServiceAreaRead.from_orm(service_area)

    @staticmethod
    def delete_service_area(uow: SqlAlchemyUnitOfWork, uuid: str) -> ServiceAreaRead:
        service_area = uow.service_area_repository.find_one(uuid=uuid, is_deleted=False)
        if not service_area:
            raise NotFoundError('service_area not found')

        service_area.is_deleted = True
        uow.service_area_repository.save(model=service_area, commit=False)
        return ServiceAreaRead.from_orm(service_area)

