"""Kill a worker whose request has wedged, the way sync workers used to.

WHY THIS FILE EXISTS. gunicorn's `--timeout` is a WORKER-LIVENESS timeout,
not a request timeout, and that distinction only bites once you use threads.
Measured on this app:

    sync    + --timeout 5  -> a 30s handler is killed at 5.3s, worker reboots
    gthread + --timeout 5  -> the same handler runs all 30s, no WORKER TIMEOUT

The arbiter watches the worker's heartbeat, and under gthread the main thread
keeps beating while a request thread is stuck. So moving to threads — which
is what stops one slow request freezing every other user — silently removes
the only thing that recovered from a wedged request.

Most hangs do not need this. A request blocked in Postgres is freed by
statement_timeout, a lock wait by lock_timeout, an outbound call by its own
timeout (all four in this backend have one). Those were measured: the thread
is released and the API recovers on its own.

What none of them catch is a request burning CPU with no I/O at all — a loop
that never exits. Measured: two such requests take both threads, the API
answers nothing, and it stays that way indefinitely. Under one sync worker
gunicorn would have killed and rebooted it. This restores that.

HOW. Every request registers its start; a daemon thread checks the register
and, if anything has been running past the limit, logs what it was and
SIGABRTs its own worker. The arbiter sees the worker die and starts a fresh
one — exactly the sync behaviour, at worker granularity.

THE LIMIT IS DELIBERATELY GENEROUS. It must sit above the slowest LEGITIMATE
request or it becomes a bug of its own. The known worst case is trip routing
against a degraded OSRM: 20 legs x 2s + 8s table = 48s (see
trip/saleman_router.py), plus clustering and the database on top. 120s leaves
real headroom while still turning "wedged forever" into "wedged for two
minutes". Raise saleman_router's budget and this must move with it.

Off unless REQUEST_WATCHDOG_SECONDS is set, which docker-compose does for the
web service only — the workers and the test suite have no use for it.
"""
import logging
import os
import signal
import threading
import time

log = logging.getLogger(__name__)

# request-id -> (started_at, method, path)
_in_flight: dict = {}
_lock = threading.Lock()
_CHECK_INTERVAL_SECONDS = 5


def _watch(limit_seconds: float):
    while True:
        time.sleep(_CHECK_INTERVAL_SECONDS)
        now = time.monotonic()
        with _lock:
            overdue = [
                (rid, started, method, path)
                for rid, (started, method, path) in _in_flight.items()
                if now - started > limit_seconds
            ]
        if not overdue:
            continue
        for _rid, started, method, path in overdue:
            log.error(
                "REQUEST WATCHDOG: %s %s has run for %.0fs (limit %.0fs); "
                "aborting this worker so the arbiter replaces it",
                method, path, now - started, limit_seconds,
            )
        # SIGABRT rather than sys.exit: the request is stuck in a thread this
        # one cannot interrupt, so the process itself has to go. gunicorn
        # treats it as a dead worker and boots a replacement.
        os.kill(os.getpid(), signal.SIGABRT)


def install(app):
    """Arm the watchdog on `app`, if REQUEST_WATCHDOG_SECONDS says to."""
    raw = os.getenv("REQUEST_WATCHDOG_SECONDS", "").strip()
    if not raw:
        return
    try:
        limit = float(raw)
    except ValueError:
        log.warning("REQUEST_WATCHDOG_SECONDS=%r is not a number; watchdog off", raw)
        return
    if limit <= 0:
        return

    @app.before_request
    def _register():
        from flask import g, request
        g._watchdog_id = object()
        with _lock:
            _in_flight[id(g._watchdog_id)] = (
                time.monotonic(), request.method, request.path,
            )

    @app.teardown_request
    def _unregister(_exc=None):
        from flask import g
        marker = getattr(g, "_watchdog_id", None)
        if marker is None:
            return
        with _lock:
            _in_flight.pop(id(marker), None)

    threading.Thread(
        target=_watch, args=(limit,), name="request-watchdog", daemon=True,
    ).start()
    log.info("request watchdog armed at %.0fs", limit)
