"""Shared query-param helpers for the read-only analytics endpoints.

These were duplicated across the customer and inventory analytics blocks; new
analytics routes should import them from here instead of adding a third copy.
"""
from datetime import datetime, timedelta

from flask import request

from app.entrypoint.routes.common.errors import BadRequestError

BUCKETS = ("day", "week", "month")


def parse_dt(value, end_of_day=False):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise BadRequestError(f"Invalid date: {value}")
    # a date-only upper bound means "through that day", not "up to its midnight"
    if end_of_day and len(value) == 10:
        parsed = parsed + timedelta(days=1) - timedelta(microseconds=1)
    return parsed


def bucket_arg(default="day"):
    bucket = request.args.get("bucket", default)
    if bucket not in BUCKETS:
        raise BadRequestError(f"bucket must be one of {', '.join(BUCKETS)}")
    return bucket


def csv_arg(name, max_items=50):
    raw = request.args.get(name)
    values = [v for v in raw.split(",") if v] if raw else []
    if len(values) > max_items:
        raise BadRequestError(f"{name} accepts at most {max_items} values")
    return values


def int_arg(name, default, minimum, maximum=None):
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except ValueError:
        raise BadRequestError(f"{name} must be an integer")
    if value < minimum:
        raise BadRequestError(f"{name} must be >= {minimum}")
    return min(value, maximum) if maximum is not None else value


def like_escape(value):
    """Treat user input as a literal: % and _ are wildcards in LIKE."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
