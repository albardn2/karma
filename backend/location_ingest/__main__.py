"""Location ingest service: subscribes to the MQTT location topics and stores
points into location_ping per the global cadence rules.

Runs as its own compose service using the backend image:
    entrypoint: ["python", "-m", "location_ingest"]

Storage rules (see LocationTrackingConfig):
- user has an in-progress trip  -> store at trip_cadence_seconds, stamped with
  trip_uuid (kept forever — they belong to the trip)
- otherwise                     -> store at history_cadence_seconds with
  trip_uuid NULL (purged past history_retention_days)

The broker may be public (broker.emqx.io for now), so every message is
validated against the database: the topic's user must exist, have
track_location enabled, and match the payload's user_uuid. Spoofing an
enabled user's topic remains possible on a public broker — moving to a
private broker closes that (tracked for prod).
"""
import json
import logging
import os
import queue
import time
import uuid as uuid_lib
from datetime import datetime, timedelta, timezone

import paho.mqtt.client as mqtt

from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
from app.utils.geom_utils import lat_lon_to_wkt
from models.common import (
    LocationPing as LocationPingModel,
    LocationTrackingConfig as ConfigModel,
    Task as TaskModel,
    TaskExecution as TaskExecutionModel,
    Trip as TripModel,
    User as UserModel,
    WorkflowExecution as WFEModel,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("location-ingest")

BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "broker.emqx.io")
BROKER_PORT = int(os.environ.get("MQTT_BROKER_TCP_PORT", "1883"))
ENV = os.environ.get("KARMA_ENV", "dev")
TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", f"karma-grp/location/{ENV}")

CONFIG_RELOAD_SECONDS = 60
TRIP_CACHE_SECONDS = 30
PURGE_INTERVAL_SECONDS = 3600

_messages: "queue.Queue[tuple[str, bytes]]" = queue.Queue(maxsize=10000)


def _on_connect(client, userdata, flags, reason_code, properties):
    # Two patterns, deliberately.
    #
    # `{PREFIX}/{account}/{user}` is the current shape: topics are namespaced per
    # account so one tenant's wildcard subscription cannot see another's drivers.
    #
    # `{PREFIX}/{user}` is the old shape, kept subscribed because an app build in
    # someone's pocket goes on publishing to it until it next reads
    # /location/client-config. Dropping it at deploy time would silently stop
    # ingesting those users' pings — a data hole with no error anywhere. Remove this
    # once no client can still be on the old topic.
    log.info(
        "connected to %s:%s (rc=%s); subscribing %s/+/+ and %s/+ (legacy)",
        BROKER_HOST, BROKER_PORT, reason_code, TOPIC_PREFIX, TOPIC_PREFIX,
    )
    client.subscribe(f"{TOPIC_PREFIX}/+/+", qos=0)
    client.subscribe(f"{TOPIC_PREFIX}/+", qos=0)


def _split_topic(topic: str) -> tuple[str | None, str | None]:
    """(account_uuid, user_uuid) from a location topic.

    Handles both shapes we subscribe to: `{PREFIX}/{account}/{user}` gives both, and
    the legacy `{PREFIX}/{user}` gives (None, user). Anything not under PREFIX, or
    with more segments than expected, yields (None, None) so the caller drops it
    rather than guessing.
    """
    if not topic.startswith(f"{TOPIC_PREFIX}/"):
        return None, None
    rest = topic[len(TOPIC_PREFIX) + 1:].split("/")
    if len(rest) == 1:
        return None, rest[0] or None
    if len(rest) == 2:
        return (rest[0] or None), (rest[1] or None)
    return None, None


def _on_message(client, userdata, msg):
    try:
        _messages.put_nowait((msg.topic, msg.payload))
    except queue.Full:
        log.warning("message queue full; dropping")


def _parse_recorded_at(raw) -> datetime:
    if not raw:
        return datetime.utcnow()
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return datetime.utcnow()
    # clamp obviously-wrong clocks to now
    now = datetime.utcnow()
    if dt > now + timedelta(minutes=5):
        return now
    return dt


class Ingestor:
    def __init__(self):
        # per-account configs (multi-tenant); accounts without a row use defaults
        self._default_config = {"trip_cadence_seconds": 30, "history_cadence_seconds": 120, "history_retention_days": 14}
        self._configs: dict[str, dict] = {}
        self._config_loaded_at = 0.0
        self._last_stored: dict[tuple[str, str], float] = {}  # (user_uuid, stream) -> monotonic ts
        self._trip_cache: dict[str, tuple[str | None, float]] = {}  # user_uuid -> (trip_uuid, expires)
        self._last_purge = 0.0

    def _reload_config(self, uow) -> None:
        if time.monotonic() - self._config_loaded_at < CONFIG_RELOAD_SECONDS:
            return
        self._configs = {
            c.account_uuid: {
                "trip_cadence_seconds": c.trip_cadence_seconds,
                "history_cadence_seconds": c.history_cadence_seconds,
                "history_retention_days": c.history_retention_days,
            }
            for c in uow.session.query(ConfigModel).all()
        }
        self._config_loaded_at = time.monotonic()

    def _config_for(self, account_uuid: "str | None") -> dict:
        return self._configs.get(account_uuid, self._default_config)

    def _active_trip_uuid(self, uow, user) -> "str | None":
        cached = self._trip_cache.get(user.uuid)
        if cached and cached[1] > time.monotonic():
            return cached[0]
        values = [user.uuid, user.username]
        row = (
            uow.session.query(TripModel.uuid)
            .join(WFEModel, TripModel.workflow_execution_uuid == WFEModel.uuid)
            .join(TaskExecutionModel, TaskExecutionModel.workflow_execution_uuid == WFEModel.uuid)
            .join(TaskModel, TaskModel.uuid == TaskExecutionModel.task_uuid)
            .filter(
                TripModel.status == "in_progress",
                TripModel.account_uuid == user.account_uuid,
                TripModel.is_deleted.is_(False),
                WFEModel.is_deleted.is_(False),
                TaskModel.operator == "start_trip_operator",
                TaskExecutionModel.result["assigned_user_uuid"].astext.in_(values),
            )
            .first()
        )
        trip_uuid = row[0] if row else None
        self._trip_cache[user.uuid] = (trip_uuid, time.monotonic() + TRIP_CACHE_SECONDS)
        return trip_uuid

    def _purge_history(self, uow) -> None:
        if time.monotonic() - self._last_purge < PURGE_INTERVAL_SECONDS:
            return
        # per-account retention: explicit config rows first, defaults for the rest
        deleted = 0
        for account_uuid, cfg in self._configs.items():
            cutoff = datetime.utcnow() - timedelta(days=cfg["history_retention_days"])
            deleted += (
                uow.session.query(LocationPingModel)
                .filter(
                    LocationPingModel.trip_uuid.is_(None),
                    LocationPingModel.account_uuid == account_uuid,
                    LocationPingModel.recorded_at < cutoff,
                )
                .delete(synchronize_session=False)
            )
        default_cutoff = datetime.utcnow() - timedelta(days=self._default_config["history_retention_days"])
        q = uow.session.query(LocationPingModel).filter(
            LocationPingModel.trip_uuid.is_(None),
            LocationPingModel.recorded_at < default_cutoff,
        )
        if self._configs:
            q = q.filter(LocationPingModel.account_uuid.notin_(list(self._configs.keys())))
        deleted += q.delete(synchronize_session=False)
        uow.commit()
        if deleted:
            log.info("purged %s history points past retention", deleted)
        self._last_purge = time.monotonic()

    def handle(self, topic: str, payload: bytes) -> None:
        try:
            data = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        topic_account, topic_user = _split_topic(topic)
        if not topic_user or data.get("user_uuid") != topic_user:
            return
        coords = data.get("coordinates")
        if not isinstance(coords, str) or "," not in coords:
            return
        try:
            wkt = lat_lon_to_wkt(coords=coords)
        except Exception:
            return

        with SqlAlchemyUnitOfWork() as uow:
            self._reload_config(uow)
            self._purge_history(uow)

            user = uow.user_repository.find_one(uuid=topic_user, is_deleted=False)
            if not user or not user.track_location:
                return
            # A namespaced topic must name the user's OWN account. The broker is
            # public and authenticates nobody, so without this anyone could publish
            # under another tenant's namespace and have it stored as that tenant's
            # data. The user lookup proves the user exists; this proves the namespace
            # was not forged. Legacy topics carry no account segment and are trusted
            # exactly as far as they were before.
            if topic_account is not None and topic_account != user.account_uuid:
                log.warning(
                    "dropping ping for user %s: topic account %s != user account %s",
                    topic_user, topic_account, user.account_uuid,
                )
                return

            trip_uuid = self._active_trip_uuid(uow, user)
            stream = "trip" if trip_uuid else "hist"
            cfg = self._config_for(user.account_uuid)
            cadence = cfg["trip_cadence_seconds"] if trip_uuid else cfg["history_cadence_seconds"]
            last = self._last_stored.get((user.uuid, stream))
            now_mono = time.monotonic()
            if last is not None and (now_mono - last) < cadence:
                return

            def _num(key):
                v = data.get(key)
                return float(v) if isinstance(v, (int, float)) else None

            ping = LocationPingModel(
                uuid=str(uuid_lib.uuid4()),
                account_uuid=user.account_uuid,
                user_uuid=user.uuid,
                trip_uuid=trip_uuid,
                coordinates=wkt,
                recorded_at=_parse_recorded_at(data.get("recorded_at")),
                speed=_num("speed"),
                heading=_num("heading"),
                accuracy=_num("accuracy"),
            )
            uow.session.add(ping)
            uow.commit()
            self._last_stored[(user.uuid, stream)] = now_mono
            log.info("stored %s point for %s%s", stream, user.username, f" (trip {trip_uuid[:8]})" if trip_uuid else "")


def main():
    ingestor = Ingestor()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"karma-ingest-{ENV}-{uuid_lib.uuid4().hex[:8]}")
    client.on_connect = _on_connect
    client.on_message = _on_message
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
    client.loop_start()

    log.info("ingest loop running (prefix=%s)", TOPIC_PREFIX)
    while True:
        try:
            topic, payload = _messages.get(timeout=5)
        except queue.Empty:
            continue
        try:
            ingestor.handle(topic, payload)
        except Exception:
            log.exception("failed to handle message on %s", topic)


if __name__ == "__main__":
    main()
