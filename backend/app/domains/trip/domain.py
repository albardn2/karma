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
        trip = uow.trip_repository.find_one(uuid=uuid, is_deleted=False)
        if not trip:
            raise NotFoundError('Trip not found')

        updates = payload.model_dump(exclude_unset=True)
        for field, val in updates.items():
            setattr(trip, field, val)
        uow.trip_repository.save(model=trip, commit=False)
        return TripRead.from_orm(trip)

    @staticmethod
    def set_audited(
        uow: SqlAlchemyUnitOfWork,
        uuid: str,
        audited: bool,
        audited_by_uuid: str = None,
    ) -> TripRead:
        """Sign a trip off, or take the sign-off back.

        Marking an already-audited trip keeps the ORIGINAL timestamp and
        auditor: the record says who first reviewed it, and a stray second click
        should not quietly reassign that. Un-auditing clears both fields together
        so `is_audited` can never disagree with them.
        """
        trip = uow.trip_repository.find_one(uuid=uuid, is_deleted=False)
        if not trip:
            raise NotFoundError('Trip not found')

        if audited:
            if trip.audited_at is None:
                trip.audited_at = datetime.utcnow()
                trip.audited_by_uuid = audited_by_uuid
        else:
            trip.audited_at = None
            trip.audited_by_uuid = None

        uow.trip_repository.save(model=trip, commit=False)
        return TripRead.from_orm(trip)

    @staticmethod
    def cancel_trip(uow: SqlAlchemyUnitOfWork, uuid: str) -> TripRead:
        trip = uow.trip_repository.find_one(uuid=uuid)
        if not trip:
            raise NotFoundError('Trip not found')

        if trip.status in [TripStatus.COMPLETED.value, TripStatus.CANCELLED.value]:
            raise BadRequestError("Cannot cancel a completed or already cancelled trip")

        trip.status = TripStatus.CANCELLED.value
        trip.end_time = datetime.now()

        trip_stops = trip.stops
        for stop in trip_stops:
            if stop.status not in [TripStopStatus.COMPLETED.value, TripStopStatus.CANCELLED.value]:
                stop.status = TripStopStatus.CANCELLED.value
        uow.trip_repository.save(model=trip, commit=False)
        return TripRead.from_orm(trip)