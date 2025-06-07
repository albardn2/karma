from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from models.common import TripStop as TripStopModel
from app.dto.trip_stop import TripStopCreate, TripStopRead
from app.utils.geom_utils import wkt_or_wkb_to_lat_lon
from geoalchemy2.shape import to_shape
from app.dto.trip_stop import TripStopUpdate


class TripStopDomain:

    @staticmethod
    def create_trip_stop(uow: SqlAlchemyUnitOfWork, payload: TripStopCreate) -> TripStopRead:
        if payload.customer_uuid:
            customer = uow.customer_repository.find_one(uuid=payload.customer_uuid, is_deleted=False)
            if not customer:
                raise NotFoundError("Customer not found")

            coordinates_wkt = to_shape(customer.coordinates).wkt # to lat,ln
            payload.coordinates = coordinates_wkt

        data = payload.model_dump()
        trip_stop = TripStopModel(**data)
        uow.trip_stop_repository.save(model=trip_stop, commit=False)
        return TripStopRead.from_orm(trip_stop)

    @staticmethod
    def update_trip_stop(uow: SqlAlchemyUnitOfWork, uuid: str, payload: TripStopUpdate) -> TripStopRead:
        trip_stop = uow.trip_stop_repository.find_one(uuid=uuid)
        if not trip_stop:
            raise NotFoundError('Trip not found')

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(trip_stop, field, val)
        uow.trip_stop_repository.save(model=trip_stop, commit=False)
        return TripStopRead.from_orm(trip_stop)


    @staticmethod
    def delete_trip_stop(uow: SqlAlchemyUnitOfWork, uuid: str) -> None:
        trip_stop = uow.trip_stop_repository.find_one(uuid=uuid)
        if not trip_stop:
            raise NotFoundError('Trip stop not found')

        uow.trip_stop_repository.delete(model=trip_stop, commit=False)
