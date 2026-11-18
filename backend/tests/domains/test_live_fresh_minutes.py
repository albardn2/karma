"""The live-map window: how recent a driver's last fix must be to show as live.

One platform-wide value, stored as a PlatformSetting, edited on the Super Admin
page and handed to every client through /location/client-config.
"""
import inspect
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from app.dto.location import LiveWindowSetting
from app.entrypoint.routes.location import live_window
from models.common import LocationTrackingConfig, PlatformSetting

MAX_MINUTES = 1440


def _uow_with(row):
    uow = MagicMock()
    uow.session.query.return_value.filter_by.return_value.one_or_none.return_value = row
    return uow


def test_live_window_defaults_to_five_minutes_when_never_set():
    assert live_window.read_live_window_minutes(_uow_with(None)) == live_window.DEFAULT_LIVE_WINDOW_MINUTES == 5


def test_live_window_reads_the_platform_setting():
    row = PlatformSetting(key=live_window.LIVE_WINDOW_SETTING_KEY, value={"minutes": 12})

    assert live_window.read_live_window_minutes(_uow_with(row)) == 12


@pytest.mark.parametrize("value", [None, {}, {"minutes": 0}, {"minutes": "7"}])
def test_live_window_falls_back_to_the_default_for_an_unusable_value(value):
    row = PlatformSetting(key=live_window.LIVE_WINDOW_SETTING_KEY, value=value)

    assert live_window.read_live_window_minutes(_uow_with(row)) == live_window.DEFAULT_LIVE_WINDOW_MINUTES


def test_writing_the_live_window_updates_the_existing_row():
    row = PlatformSetting(key=live_window.LIVE_WINDOW_SETTING_KEY, value={"minutes": 5})
    uow = _uow_with(row)

    live_window.write_live_window_minutes(uow, 9)

    assert row.value == {"minutes": 9}
    uow.session.add.assert_not_called()


def test_writing_the_live_window_creates_the_row_when_missing():
    uow = _uow_with(None)

    live_window.write_live_window_minutes(uow, 9)

    added = uow.session.add.call_args.args[0]
    assert (added.key, added.value) == (live_window.LIVE_WINDOW_SETTING_KEY, {"minutes": 9})


@pytest.mark.parametrize("minutes", [1, 5, MAX_MINUTES])
def test_live_window_setting_accepts_minutes_within_bounds(minutes):
    assert LiveWindowSetting(minutes=minutes).minutes == minutes


@pytest.mark.parametrize("minutes", [0, -1, MAX_MINUTES + 1])
def test_live_window_setting_rejects_minutes_out_of_bounds(minutes):
    with pytest.raises(ValidationError):
        LiveWindowSetting(minutes=minutes)


def test_live_window_is_not_a_per_account_setting():
    assert "live_fresh_minutes" not in LocationTrackingConfig.__table__.c


def test_client_config_hands_the_platform_live_window_to_the_live_maps():
    from app.entrypoint.routes.location import routes

    src = inspect.getsource(routes.client_config)

    assert '"fresh_minutes": read_live_window_minutes(uow)' in src


def test_only_a_super_admin_may_change_the_live_window():
    from app.entrypoint.routes.super_admin import routes

    src = inspect.getsource(routes)
    put_route = src[src.index('"/settings/live-window", methods=["PUT"]'):]

    assert put_route.splitlines()[1].strip() == "@scopes_required(SUPER)"
