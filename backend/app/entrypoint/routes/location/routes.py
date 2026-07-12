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
def _broker_config():
    env = os.environ.get("KARMA_ENV", "dev")
    host = os.environ.get("MQTT_BROKER_HOST", "broker.emqx.io")
    return {
        "host": host,
        "ws_url": os.environ.get("MQTT_BROKER_WS_URL", f"wss://{host}:8084/mqtt"),
        "tcp_port": int(os.environ.get("MQTT_BROKER_TCP_PORT", "1883")),
        "topic_prefix": os.environ.get("MQTT_TOPIC_PREFIX", f"karma-grp/location/{env}"),
    }


def _get_config(uow):
    config = uow.session.query(LocationTrackingConfigModel).first()
    if not config:
        raise NotFoundError("Location tracking config not found (run migrations)")
    return config


@location_blueprint.route("/config", methods=["GET"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
def get_config():
    with SqlAlchemyUnitOfWork() as uow:
        config = _get_config(uow)
        result = LocationTrackingConfigRead.from_orm(config).model_dump(mode="json")
    return jsonify(result), 200


@location_blueprint.route("/config", methods=["PUT"])
@jwt_required()
@scopes_required(PermissionScope.ADMIN.value, PermissionScope.SUPER_ADMIN.value)
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
        broker = _broker_config()
        result = {
            "track_location": bool(user.track_location),
            "ping_seconds": int(user.location_ping_seconds or 15),
            "broker_ws_url": broker["ws_url"],
            "topic": f"{broker['topic_prefix']}/{user.uuid}",
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
            .filter(LocationPingModel.trip_uuid == trip_uuid)
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
            LocationPingModel.user_uuid == user_uuid
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
