from datetime import datetime

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.entrypoint.routes.common.errors import NotFoundError,BadRequestError
from models.common import Trip as TripModel
from app.dto.trip import TripRead, TripCreate
from app.dto.trip import TripUpdate
from app.dto.trip import (
    MAX_SUMMARY_TRIPS,
    TripSummary,
    TripSummaryCash,
    TripSummaryMaterial,
)

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
    def summarize(uow: SqlAlchemyUnitOfWork, trip_uuids: list[str]) -> TripSummary:
        """Roll several trips up into one cash-and-stock picture.

        Deliberately built on the Trip model's own properties (`expected_cash`,
        `trip_expenses`, `inventory_reconciliation`) rather than fresh SQL. Those
        encode which money and which stock movements count — deleted payments,
        voided invoices, orders soft-deleted before the cascade existed, sale
        events left behind by legacy voids. A second implementation in SQL would
        drift from the per-trip page it is meant to agree with.

        Two things are reported rather than swallowed, because both make the
        totals mean less than they appear to:
          - uuids that resolve to nothing in this account (deleted, or another
            tenant's) — counting them as zero would hide that the summary covers
            fewer trips than the caller picked;
          - trips with no end snapshot, whose stock has not been counted back in.
        """
        page = uow.trip_repository.find_all_by_filters_paginated(
            filters=[
                TripModel.uuid.in_(trip_uuids),
                TripModel.is_deleted.is_(False),
            ],
            page=1,
            per_page=MAX_SUMMARY_TRIPS,
        )
        trips = page.items
        found = {t.uuid for t in trips}
        # keep the caller's order so the response lines up with their selection
        missing = [u for u in trip_uuids if u not in found]

        cash: dict[str, dict[str, float]] = {}

        def _cash_row(currency: str) -> dict[str, float]:
            return cash.setdefault(currency, {"collected": 0.0, "expenses": 0.0})

        materials: dict[str, dict] = {}

        def _material_row(material_uuid: str) -> dict:
            return materials.setdefault(material_uuid, {
                "loaded": 0.0, "sold": 0.0, "returned": 0.0,
                "net_change": 0.0, "variance": 0.0, "net_change_partial": False,
            })

        no_end_snapshot = []
        for trip in trips:
            for currency, amount in (trip.expected_cash or {}).items():
                _cash_row(currency)["collected"] += amount or 0
            for currency, amount in (trip.trip_expenses or {}).items():
                # a currency that was only spent in still needs a row
                _cash_row(currency)["expenses"] += amount or 0

            if not trip.end_inventory:
                no_end_snapshot.append(trip.uuid)

            for material_uuid, recon in (trip.inventory_reconciliation or {}).items():
                row = _material_row(material_uuid)
                row["loaded"] += recon.get("start") or 0
                row["sold"] += recon.get("sold") or 0
                actual_end = recon.get("actual_end")
                if actual_end is None:
                    # nothing was counted back in for this material on this trip,
                    # so it can contribute to sold but not to the net change
                    row["net_change_partial"] = True
                    continue
                row["returned"] += actual_end
                row["net_change"] += actual_end - (recon.get("start") or 0)
                row["variance"] += recon.get("variance") or 0

        return TripSummary(
            trip_count=len(trips),
            trip_uuids=[t.uuid for t in trips],
            cash=[
                TripSummaryCash(
                    currency=currency,
                    collected=round(row["collected"], 2),
                    expenses=round(row["expenses"], 2),
                    # from the unrounded pair, so the column always adds up
                    net=round(row["collected"] - row["expenses"], 2),
                )
                for currency, row in sorted(cash.items())
            ],
            materials=TripDomain._material_summary_rows(uow, materials),
            missing_uuids=missing,
            trips_without_end_inventory=no_end_snapshot,
        )

    @staticmethod
    def _material_summary_rows(uow: SqlAlchemyUnitOfWork, materials: dict[str, dict]):
        """Attach names to the aggregated material rows, sorted by name.

        One query for every material rather than one each, and account-scoped:
        a material uuid that is not this tenant's resolves to no name instead of
        leaking one.
        """
        from models.common import Material as MaterialModel

        names: dict[str, tuple] = {}
        if materials:
            names = {
                uuid_: (name, unit)
                for uuid_, name, unit in uow.session.query(
                    MaterialModel.uuid, MaterialModel.name, MaterialModel.measure_unit
                ).filter(
                    MaterialModel.uuid.in_(materials.keys()),
                    MaterialModel.account_uuid == uow.account_uuid,
                )
            }

        rows = [
            TripSummaryMaterial(
                material_uuid=material_uuid,
                material_name=names.get(material_uuid, (None, None))[0],
                measure_unit=names.get(material_uuid, (None, None))[1],
                # quantities can be fractional (kg); 3dp keeps a gram honest
                loaded=round(agg["loaded"], 3),
                sold=round(agg["sold"], 3),
                returned=round(agg["returned"], 3),
                net_change=round(agg["net_change"], 3),
                variance=round(agg["variance"], 3),
                net_change_partial=agg["net_change_partial"],
            )
            for material_uuid, agg in materials.items()
        ]
        # named materials first, alphabetically; unnamed ones last by uuid
        rows.sort(key=lambda r: (r.material_name is None, r.material_name or r.material_uuid))
        return rows

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