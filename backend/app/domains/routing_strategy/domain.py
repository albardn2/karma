from sqlalchemy.exc import IntegrityError

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.routing_strategy import (
    RoutingStrategyCreate,
    RoutingStrategyRead,
    RoutingStrategyUpdate,
)
from app.entrypoint.routes.common.errors import BadRequestError, NotFoundError
from models.common import RoutingStrategy as RoutingStrategyModel


def _save_or_duplicate(uow: SqlAlchemyUnitOfWork, strategy: RoutingStrategyModel, name: str):
    """save() flushes internally (AbstractRepository.save has its own
    try/flush/re-raise), so the CI-unique index violation surfaces HERE — two
    concurrent requests can both pass the find_by_name_ci pre-check, and the
    index is the real guard. Map that race to the same friendly 400 the
    pre-check gives instead of the global handler's generic 409."""
    try:
        uow.routing_strategy_repository.save(model=strategy, commit=False)
    except IntegrityError as exc:
        if "uq_routing_strategy_account_lower_name" in str(exc.orig):
            raise BadRequestError(f"A routing strategy named '{name}' already exists")
        raise


class RoutingStrategyDomain:

    @staticmethod
    def create_routing_strategy(uow: SqlAlchemyUnitOfWork, payload: RoutingStrategyCreate) -> RoutingStrategyRead:
        # names are matched case-insensitively when the route step resolves
        # the strategy, so uniqueness must be case-insensitive too
        if uow.routing_strategy_repository.find_by_name_ci(payload.name):
            raise BadRequestError(f"A routing strategy named '{payload.name}' already exists")
        strategy = RoutingStrategyModel(
            name=payload.name,
            config=payload.config.model_dump(mode="json"),
            created_by_uuid=payload.created_by_uuid,
        )
        _save_or_duplicate(uow, strategy, payload.name)
        return RoutingStrategyRead.from_orm(strategy)

    @staticmethod
    def update_routing_strategy(uow: SqlAlchemyUnitOfWork, uuid: str, payload: RoutingStrategyUpdate) -> RoutingStrategyRead:
        strategy = uow.routing_strategy_repository.find_one(uuid=uuid, is_deleted=False)
        if not strategy:
            raise NotFoundError(f"RoutingStrategy not found with uuid: {uuid}")
        if payload.name is not None:
            existing = uow.routing_strategy_repository.find_by_name_ci(payload.name)
            if existing and existing.uuid != strategy.uuid:
                raise BadRequestError(f"A routing strategy named '{payload.name}' already exists")
            strategy.name = payload.name
        if payload.config is not None:
            strategy.config = payload.config.model_dump(mode="json")
        _save_or_duplicate(uow, strategy, strategy.name)
        return RoutingStrategyRead.from_orm(strategy)

    @staticmethod
    def delete_routing_strategy(uow: SqlAlchemyUnitOfWork, uuid: str) -> RoutingStrategyRead:
        strategy = uow.routing_strategy_repository.find_one(uuid=uuid, is_deleted=False)
        if not strategy:
            raise NotFoundError(f"RoutingStrategy not found with uuid: {uuid}")
        # soft delete: executions already routed by it keep their stored
        # results; a setup completed later with this name 400s at the route
        # step, which is the loud failure we want
        strategy.is_deleted = True
        uow.routing_strategy_repository.save(model=strategy, commit=False)
        return RoutingStrategyRead.from_orm(strategy)
