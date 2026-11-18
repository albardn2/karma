"""The live-map window: one platform-wide value, stored as a PlatformSetting.

A driver shows as live (green) on the live maps while their last fix is at most
this many minutes old, and as stale (gray) after that. It is the same for every
account, so it lives on the platform rather than on location_tracking_config.
"""
from models.common import PlatformSetting

LIVE_WINDOW_SETTING_KEY = "live_fresh_minutes"
DEFAULT_LIVE_WINDOW_MINUTES = 5


def read_live_window_minutes(uow) -> int:
    row = uow.session.query(PlatformSetting).filter_by(key=LIVE_WINDOW_SETTING_KEY).one_or_none()
    minutes = (row.value or {}).get("minutes") if row else None
    return minutes if isinstance(minutes, int) and minutes > 0 else DEFAULT_LIVE_WINDOW_MINUTES


def write_live_window_minutes(uow, minutes: int) -> None:
    row = uow.session.query(PlatformSetting).filter_by(key=LIVE_WINDOW_SETTING_KEY).one_or_none()
    if row:
        row.value = {"minutes": minutes}
    else:
        uow.session.add(PlatformSetting(key=LIVE_WINDOW_SETTING_KEY, value={"minutes": minutes}))
    uow.session.flush()
