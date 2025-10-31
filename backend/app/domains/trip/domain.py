from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from models.common import Trip as TripModel
from app.dto.trip import TripRead, TripCreate
from app.dto.trip import TripUpdate

from app.dto.trip import TripStatus
from app.dto.trip_stop import TripStopStatus


class TripDomain:


    @staticmethod
    def create_trip(uow: SqlAlchemyUnitOfWork, payload: TripCreate) -> TripRead:
        data = payload.model_dump()
        trip = TripModel(**data)
        uow.trip_repository.save(model=trip, commit=False)
        return TripRead.from_orm(trip)

    @staticmethod
    def update_trip(uow: SqlAlchemyUnitOfWork, uuid: str, payload: TripUpdate) -> TripRead:
        trip = uow.trip_repository.find_one(uuid=uuid)
        if not trip:
            raise NotFoundError('Trip not found')

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(trip, field, val)
        uow.trip_repository.save(model=trip, commit=False)
        return TripRead.from_orm(trip)

    @staticmethod
    def cancel_trip(uow: SqlAlchemyUnitOfWork, uuid: str) -> TripRead:
        trip = uow.trip_repository.find_one(uuid=uuid)
        if not trip:
            raise NotFoundError('Trip not found')

        if trip.status in [TripStatus.COMPLETED.value, TripStatus.CANCELLED.value]:
            raise BadRequestError("Cannot cancel a completed or already cancelled trip")

        trip.status = TripModel.CANCELLED.value
        trip.end_time = datetime.now()

        trip_stops = trip.stops
        for stop in trip_stops:
            if stop.status not in [TripStopStatus.COMPLETED, TripStopStatus.CANCELLED]:
                stop.status = TripStopStatus.CANCELLED.value
        uow.trip_repository.save(model=trip, commit=False)
        return TripRead.from_orm(trip)