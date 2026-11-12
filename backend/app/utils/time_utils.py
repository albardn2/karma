from datetime import datetime, timezone
from typing import Optional


def utc_iso(value: Optional[datetime]) -> Optional[str]:
    """ISO-8601 with a trailing Z for a timestamp stored as naive UTC.

    Without the zone a client reads the value as its own local time. Date-only
    values (billing days, calendar buckets) are not timestamps and must not go
    through this.
    """
    if value is None:
        return None
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    return aware.isoformat().replace("+00:00", "Z")


def to_naive_utc(value: datetime) -> datetime:
    """The naive-UTC form the columns hold; a naive input is taken as UTC already."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def parse_client_iso(value: str) -> datetime:
    """A client-sent ISO date or timestamp as naive UTC.

    Accepts a trailing Z, which Python 3.10's fromisoformat rejects, so a client can
    send back a timestamp exactly as the API gave it. Raises ValueError when unparseable.
    """
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    return to_naive_utc(datetime.fromisoformat(text))
