"""The live-map freshness window: how recent a driver's last fix must be to show as live.

It is a per-account setting on location_tracking_config, edited with the other
tracking settings and handed to every client through /location/client-config.
"""
import inspect

import pytest
from pydantic import ValidationError

from app.dto.location import LocationTrackingConfigRead, LocationTrackingConfigUpdate
from models.common import LocationTrackingConfig

DEFAULT_FRESH_MINUTES = 5
MAX_FRESH_MINUTES = 1440


def test_fresh_minutes_defaults_to_five_on_the_model_and_in_the_database():
    column = LocationTrackingConfig.__table__.c.live_fresh_minutes

    assert column.default.arg == DEFAULT_FRESH_MINUTES
    assert column.server_default.arg == str(DEFAULT_FRESH_MINUTES)
    assert column.nullable is False


@pytest.mark.parametrize("minutes", [1, DEFAULT_FRESH_MINUTES, MAX_FRESH_MINUTES])
def test_config_update_accepts_a_fresh_window_within_bounds(minutes):
    payload = LocationTrackingConfigUpdate(live_fresh_minutes=minutes)

    assert payload.live_fresh_minutes == minutes


@pytest.mark.parametrize("minutes", [0, -1, MAX_FRESH_MINUTES + 1])
def test_config_update_rejects_a_fresh_window_out_of_bounds(minutes):
    with pytest.raises(ValidationError):
        LocationTrackingConfigUpdate(live_fresh_minutes=minutes)


def test_config_read_exposes_the_fresh_window():
    config = LocationTrackingConfig(
        live_ping_seconds=15,
        live_fresh_minutes=7,
        trip_cadence_seconds=30,
        history_cadence_seconds=120,
        history_retention_days=14,
    )

    read = LocationTrackingConfigRead.model_validate(config)

    assert read.live_fresh_minutes == 7


def test_client_config_hands_the_fresh_window_to_the_live_maps():
    """The app and web live maps read the window from client-config; a missing
    account row falls back to the same default as the column."""
    from app.entrypoint.routes.location import routes

    src = inspect.getsource(routes.client_config)

    assert '"fresh_minutes"' in src
    assert f"config.live_fresh_minutes if config else {DEFAULT_FRESH_MINUTES}" in src
