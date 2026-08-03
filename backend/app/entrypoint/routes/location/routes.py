import os

from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.dto.auth import PermissionScope
from app.dto.location import (
    LocationHistoryParams,
    LocationPingRead,
    LocationSeriesRead,
    LocationTrackingConfigRead,
    LocationTrackingConfigUpdate,
)
from app.entrypoint.routes.common.auth import scopes_required
from app.entrypoint.routes.common.errors import NotFoundError
from app.entrypoint.routes.location import location_blueprint
from models.common import (
    LocationPing as LocationPingModel,
    LocationTrackingConfig as LocationTrackingConfigModel,
)


# Broker/topic settings are environment-driven so prod can move off the
# public EMQX broker without an app release (clients re-read this endpoint).
def _broker_base_prefix() -> str:
    env = os.environ.get("KARMA_ENV", "dev")
    return os.environ.get("MQTT_TOPIC_PREFIX", f"karma-grp/location/{env}")


def _broker_config(account_uuid: str):
    """Broker settings plus the caller's OWN topic namespace.

    topic_prefix is per ACCOUNT, not per environment. It used to be
    `karma-grp/location/{env}` for everybody, and this endpoint hands it to every
    authenticated user — so any user of any tenant could subscribe to `{prefix}/+`
    and receive every other tenant's driver positions. The web live map does exactly
    that subscribe and stores whatever arrives (LiveMap.tsx), so this was a live
    cross-tenant leak, not a theoretical one.

    Appending the account uuid fixes it at the only place that has to change: both
    web consumers build their topics from this prefix, so a tenant's wildcard now
    spans only its own users and no client code needs touching.

    This raises the bar; it is not a wall. The broker is public and authenticates
    nobody, so the leak now requires guessing an account uuid instead of being the
    default view. The real fix is a broker with per-tenant ACLs, which is a
    deployment change rather than a code one.
    """
    host = os.environ.get("MQTT_BROKER_HOST", "broker.emqx.io")
    return {
        "host": host,
        "ws_url": os.environ.get("MQTT_BROKER_WS_URL", f"wss://{host}:8084/mqtt"),
        "tcp_port": int(os.environ.get("MQTT_BROKER_TCP_PORT", "1883")),
        "topic_prefix": f"{_broker_base_prefix()}/{account_uuid}",
    }


def _get_config(uow):
    # per-account config; lazily created with defaults for new accounts
    config = (
        uow.session.query(LocationTrackingConfigModel)
        .filter(LocationTrackingConfigModel.account_uuid == uow.account_uuid)
        .first()
    )
    if not config:
        config = LocationTrackingConfigModel(account_uuid=uow.account_uuid)
        uow.session.add(config)
        uow.session.flush()
        uow.commit()
    return config


@location_blueprint.route("/config", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.SUPER_ADMIN.value)
def get_config():
    with SqlAlchemyUnitOfWork() as uow:
        config = _get_config(uow)
        result = LocationTrackingConfigRead.from_orm(config).model_dump(mode="json")
    return jsonify(result), 200


@location_blueprint.route("/config", methods=["PUT"])
@jwt_required()
@scopes_required(PermissionScope.SUPER_ADMIN.value)
def update_config():
    payload = LocationTrackingConfigUpdate(**request.json)
    with SqlAlchemyUnitOfWork() as uow:
        config = _get_config(uow)
        for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
            setattr(config, key, value)
        uow.session.add(config)
        uow.commit()
        result = LocationTrackingConfigRead.from_orm(config).model_dump(mode="json")
    return jsonify(result), 200


@location_blueprint.route("/client-config", methods=["GET"])
@jwt_required()
def client_config():
    """Everything the mobile app needs to start (or skip) tracking: the
    caller's own flag + cadence, and where to publish."""
    current_uuid = get_jwt_identity()
    with SqlAlchemyUnitOfWork() as uow:
        user = uow.user_repository.find_one(uuid=current_uuid, is_deleted=False)
        if not user:
            raise NotFoundError("User not found")
        # the caller's own account, so the namespace cannot be chosen by the client
        broker = _broker_config(uow.account_uuid)
        result = {
            "track_location": bool(user.track_location),
            "ping_seconds": int(user.location_ping_seconds or 15),
            "broker_ws_url": broker["ws_url"],
            "topic": f"{broker['topic_prefix']}/{user.uuid}",
            # the live-map view subscribes to `{topic_prefix}/+`
            "topic_prefix": broker["topic_prefix"],
            "user_uuid": user.uuid,
            "username": user.username,
        }
    return jsonify(result), 200


@location_blueprint.route("/trip/<string:trip_uuid>", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def trip_series(trip_uuid: str):
    with SqlAlchemyUnitOfWork() as uow:
        rows = (
            uow.session.query(LocationPingModel)
            .filter(
                LocationPingModel.trip_uuid == trip_uuid,
                LocationPingModel.account_uuid == uow.account_uuid,
            )
            .order_by(LocationPingModel.recorded_at.asc())
            .limit(20000)
            .all()
        )
        result = LocationSeriesRead(
            points=[LocationPingRead.from_orm(r) for r in rows],
            total_count=len(rows),
        ).model_dump(mode="json")
    return jsonify(result), 200


@location_blueprint.route("/user/<string:user_uuid>", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def user_series(user_uuid: str):
    params = LocationHistoryParams(**request.args)
    with SqlAlchemyUnitOfWork() as uow:
        q = uow.session.query(LocationPingModel).filter(
            LocationPingModel.user_uuid == user_uuid,
            LocationPingModel.account_uuid == uow.account_uuid,
        )
        if params.from_time:
            q = q.filter(LocationPingModel.recorded_at >= params.from_time)
        if params.to_time:
            q = q.filter(LocationPingModel.recorded_at <= params.to_time)
        rows = q.order_by(LocationPingModel.recorded_at.asc()).limit(params.limit).all()
        result = LocationSeriesRead(
            points=[LocationPingRead.from_orm(r) for r in rows],
            total_count=len(rows),
        ).model_dump(mode="json")
    return jsonify(result), 200
