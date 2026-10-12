"""The sales and interest funnels for ONE trip — the customers it stopped at,
and how its window moved them.

Same arithmetic as the company-wide dashboard (app/domains/customer/
tag_funnels.py, which this module only feeds), over a different population
and a different stretch of time:

  * WHO: the distinct, live customers on this trip's WORKED stops — completed
    or skipped, i.e. the rep got there. A cancelled stop was never reached and
    a planned or in-progress one has not been yet, so neither says anything
    about what the trip did.

  * WHEN: the trip's own window, start to end. A tag event records neither the
    trip nor the stop that caused it (customer_tag_event has customer, time
    and actor only), so attribution is by customer AND time: every change to
    these customers while the trip was running. That catches the stop
    outcomes and the orders taken at the stops — both are written while the
    trip runs — and, knowingly, anything else done to the same customers in
    the same hours (an office edit, an order placed elsewhere). A trip still
    running is measured up to now.

A CANCELLED trip's end_time is when someone closed it, which can be months
after its last stop: the abandoned-trips migration (f4a7c2e9b183) stamped
every trip it closed with the day it ran. Measuring to that would sweep in
everything that happened to the trip's customers in between, so a cancelled
trip ends at its last recorded stop activity instead. So does a trip marked
completed without an end_time (the web's new-trip dialog allows it), which
would otherwise read as still running.

"Stop activity" is a COMPLETED task execution on a worked stop, or an order
taken at one of the stops. Not any task execution's end_time: cancelling a
trip stamps end_time on every stop task nobody reached (and the migration did
the same), which would put the "last activity" right back at the
cancellation.

Kept pure so the window rules are tested without a database.
"""
from datetime import timedelta

from app.domains.customer.tag_funnels import build_payload
from app.dto.trip import TripStatus
from app.dto.trip_stop import TripStopStatus

# the stops whose customers the trip actually reached
COUNTED_STOP_STATUSES = (TripStopStatus.COMPLETED.value, TripStopStatus.SKIPPED.value)

# a closed trip with no recorded stop activity is taken to have lasted the
# day it set off — a trip is a day's work, and anything longer is a guess
CLOSED_FALLBACK = timedelta(days=1)

# A stop completion or an order is timestamped BEFORE the tag change it
# causes: the completion stamps the task's end_time and then applies the
# outcome's tags; an order is flushed and then tags its customer. Each tag
# event gets its own, slightly later utcnow(), so a window ending exactly at
# the last activity would push that activity's own move out of the trip.
ACTIVITY_GRACE = timedelta(minutes=1)


def trip_window(*, start_time, end_time, created_at, now, status=None, last_activity_at=None):
    """(start, end, is_open, estimated) — the stretch of time attributed to
    the trip.

    start: when the trip set off. Trips planned before start_time was stamped
           at departure, and trips made through POST /trip, carry none — they
           fall back to created_at, as the trip page's stock chart already
           does, and the window is marked estimated.
    end:   a completed trip's end_time; a running one is measured to now
           (is_open). A cancelled trip — or a completed one with no end_time —
           ends just after `last_activity_at` (see ACTIVITY_GRACE) and, when
           it recorded none, a day after it set off (estimated). Either way
           never later than its own end_time.

    An end before the start (clocks, hand-edited rows) collapses the window to
    nothing rather than inverting it.
    """
    start = start_time or created_at or now
    estimated = start_time is None
    closed_by_activity = status == TripStatus.CANCELLED.value or (
        status == TripStatus.COMPLETED.value and end_time is None
    )
    is_open = end_time is None and not closed_by_activity
    if is_open:
        end = now
    elif closed_by_activity:
        ceiling = end_time or now
        if last_activity_at is not None:
            end = min(ceiling, last_activity_at + ACTIVITY_GRACE)
        else:
            end = min(ceiling, start + CLOSED_FALLBACK)
            estimated = True
    else:
        end = end_time
    if end < start:
        end = start
    return start, end, is_open, estimated


def build_trip_payload(*, trip_uuid: str, start, end, is_open: bool, history_from,
                       stops: int, total: int, tag_lists, moves, moves_after,
                       created: int, created_after: int, estimated: bool = False) -> dict:
    """The response for GET /trip/<uuid>/tag-funnels.

    The funnel shape is exactly the dashboard's (see build_payload), with the
    trip window as its period: each step's at_period_end is where it stood
    when the trip ended, at_period_start where it stood when the trip began,
    net_change / entered / left / transitions what the trip did to it.

    stops: worked stops counted (a customer stopped at twice counts once in
           `total` but twice here).
    total: their distinct live customers; the remaining arguments as in
           build_payload, restricted to those customers.
    """
    payload = build_payload(
        period={
            "start": start.isoformat(),
            "end": end.isoformat(),
            # the dashboard's word for "still running, measured to now"
            "is_current": is_open,
            # the trip did not record when it started or stopped working, so
            # the window is a fallback (see trip_window) — the page says so
            "estimated": estimated,
        },
        history_from=history_from,
        total=total,
        tag_lists=tag_lists,
        moves=moves,
        moves_after=moves_after,
        created=created,
        created_after=created_after,
    )
    payload["trip_uuid"] = trip_uuid
    payload["stops"] = stops
    return payload
