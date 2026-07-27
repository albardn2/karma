from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.domains.exchange_rate.domain import ExchangeRateDomain
from app.dto.auth import PermissionScope
from app.dto.exchange_rate import (
    ExchangeRateCreate,
    ExchangeRateLatestParams,
    ExchangeRateListParams,
    ExchangeRatePage,
    ExchangeRatePullParams,
    ExchangeRateRead,
    ExchangeRateUpdate,
)
from app.entrypoint.routes.common.auth import add_logged_user_to_payload, scopes_required
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.exchange_rate import exchange_rate_blueprint
from models.common import ExchangeRate as ExchangeRateModel

# Deliberately the same set as WRITERS: the page's only controls are the pull
# and backfill buttons, and neither driver nor sales holds a `transaction`
# grant, so read access would give those roles a menu entry leading to a page
# where every action 403s.
READERS = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)
WRITERS = (
    PermissionScope.ADMIN.value,
    PermissionScope.SUPER_ADMIN.value,
    PermissionScope.OPERATION_MANAGER.value,
    PermissionScope.ACCOUNTANT.value,
)


@exchange_rate_blueprint.route('/', methods=['POST'])
@jwt_required()
@scopes_required(*WRITERS)
def create_exchange_rate():
    current_uuid = get_jwt_identity()
    payload = ExchangeRateCreate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        add_logged_user_to_payload(uow=uow, user_uuid=current_uuid, payload=payload)
        row, created = ExchangeRateDomain.upsert(uow=uow, payload=payload)
        result = ExchangeRateRead.from_orm(row).model_dump(mode='json')
        uow.commit()
    # 200 when this replaced the day's existing rate — only a genuinely new row
    # is a 201, or a client cannot tell which happened
    return jsonify(result), 201 if created else 200


@exchange_rate_blueprint.route('/', methods=['GET'])
@jwt_required()
@scopes_required(*READERS)
def list_exchange_rates():
    params = ExchangeRateListParams(**request.args)

    filters = [ExchangeRateModel.is_deleted == False]  # noqa: E712
    if params.uuid:
        filters.append(ExchangeRateModel.uuid == str(params.uuid))
    if params.from_currency:
        filters.append(ExchangeRateModel.from_currency == params.from_currency.value)
    if params.to_currency:
        filters.append(ExchangeRateModel.to_currency == params.to_currency.value)
    if params.source:
        filters.append(ExchangeRateModel.source == params.source.value)
    if params.start:
        filters.append(ExchangeRateModel.rate_date >= params.start)
    if params.end:
        filters.append(ExchangeRateModel.rate_date <= params.end)

    with SqlAlchemyUnitOfWork() as uow:
        page_obj = uow.exchange_rate_repository.find_all_by_filters_paginated(
            filters=filters,
            page=params.page,
            per_page=params.per_page,
            # newest first: the table reads as a history, most recent at the top
            ordering=[ExchangeRateModel.rate_date.desc()],
        )
        result = ExchangeRatePage(
            exchange_rates=[
                ExchangeRateRead.from_orm(r).model_dump(mode='json') for r in page_obj.items
            ],
            total_count=page_obj.total,
            page=page_obj.page,
            per_page=page_obj.per_page,
            pages=page_obj.pages,
        ).model_dump(mode='json')
    return jsonify(result), 200


@exchange_rate_blueprint.route('/latest', methods=['GET'])
@jwt_required()
@scopes_required(*READERS)
def latest_exchange_rate():
    """The default the transaction form pre-fills. 404 when we have none yet."""
    params = ExchangeRateLatestParams(**request.args)
    from_currency, to_currency = params.from_currency, params.to_currency
    with SqlAlchemyUnitOfWork() as uow:
        row = ExchangeRateDomain.latest(uow, from_currency, to_currency)
        if not row:
            raise NotFoundError(
                f"No {from_currency.value} to {to_currency.value} rate recorded yet"
            )
        result = ExchangeRateRead.from_orm(row).model_dump(mode='json')
    return jsonify(result), 200


@exchange_rate_blueprint.route('/pull', methods=['POST'])
@jwt_required()
@scopes_required(*WRITERS)
def pull_exchange_rate():
    """Fetch today's USD→SYP rate from sp-today and store it."""
    current_uuid = get_jwt_identity()
    params = ExchangeRatePullParams(**(request.json or {}))
    with SqlAlchemyUnitOfWork() as uow:
        result = ExchangeRateDomain.pull_today(
            uow=uow,
            created_by_uuid=current_uuid,
            from_currency=params.from_currency,
            to_currency=params.to_currency,
        ).model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200


@exchange_rate_blueprint.route('/backfill', methods=['POST'])
@jwt_required()
@scopes_required(*WRITERS)
def backfill_exchange_rates():
    """Ingest sp-today's daily history for a range, up to a year back."""
    current_uuid = get_jwt_identity()
    params = ExchangeRatePullParams(**(request.json or {}))

    with SqlAlchemyUnitOfWork() as uow:
        result = ExchangeRateDomain.backfill(
            uow=uow,
            created_by_uuid=current_uuid,
            from_currency=params.from_currency,
            to_currency=params.to_currency,
            backfill_range=params.range,
            start=params.start,
            end=params.end,
        ).model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200


@exchange_rate_blueprint.route('/<string:uuid>', methods=['PUT'])
@jwt_required()
@scopes_required(*WRITERS)
def update_exchange_rate(uuid: str):
    payload = ExchangeRateUpdate(**request.json)
    data = payload.model_dump(exclude_unset=True, mode='json')
    with SqlAlchemyUnitOfWork() as uow:
        row = uow.exchange_rate_repository.find_one(uuid=uuid, is_deleted=False)
        if not row:
            raise NotFoundError(f"Exchange rate with uuid {uuid} not found")
        for field, value in data.items():
            setattr(row, field, value)
        # a hand-corrected rate is no longer what the site said
        if data:
            row.source = 'manual'
        uow.exchange_rate_repository.save(model=row, commit=True)
        result = ExchangeRateRead.from_orm(row).model_dump(mode='json')
    return jsonify(result), 200


@exchange_rate_blueprint.route('/<string:uuid>', methods=['DELETE'])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def delete_exchange_rate(uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        result = ExchangeRateDomain.delete(uow=uow, uuid=uuid).model_dump(mode='json')
        uow.commit()
    return jsonify(result), 200
