"""Block until the database accepts a real TCP connection.

The postgis image briefly reports healthy during its init phase (socket-only
server) before the real TCP listener is up, so dependents can still hit a
"connection refused". This polls an actual connect() until it succeeds.
"""
import os
import time

import psycopg2

URI = os.environ["SQLALCHEMY_DATABASE_URI"]
DEADLINE = time.monotonic() + 60  # seconds

while True:
    try:
        psycopg2.connect(URI).close()
        print("[wait_for_db] database is ready")
        break
    except Exception as exc:  # noqa: BLE001
        if time.monotonic() > DEADLINE:
            raise SystemExit(f"[wait_for_db] timed out waiting for db: {exc}")
        print(f"[wait_for_db] waiting for db... ({exc})")
        time.sleep(1)
