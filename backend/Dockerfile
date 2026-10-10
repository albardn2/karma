# 1. Base image
FROM python:3.10

# 2. Environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_HOME="/opt/poetry"

# 3. Install system deps & Poetry
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl build-essential \
    && curl -sSL https://install.python-poetry.org | python3.10 - \
    && rm -rf /var/lib/apt/lists/*

# 4. Add Poetry to PATH
ENV PATH="$POETRY_HOME/bin:$PATH"

# 5. Set working dir
WORKDIR /karma

# 6. Copy Poetry files and install deps
COPY pyproject.toml poetry.lock poetry.toml* ./
RUN poetry install --only main --no-root

# 7. Copy application code
COPY . .

# 8. Expose Flask port
EXPOSE 5000

# 9. Gunicorn entrypoint
# Gunicorn's defaults are ONE sync worker, which serves the entire API one
# request at a time — every request waits for the one ahead of it. Measured
# on this app: a trivial endpoint costs 1ms alone and 490ms median behind
# six concurrent clients. The home dashboard alone fires twelve requests.
#
# 2 workers x 4 threads = 8 concurrent, on a droplet measured at 2 vCPUs and
# 1,967 MB RAM with 863 MB free and NO SWAP (read 2026-10-10 via the
# droplet-diagnostics workflow). Three workers was the first instinct and is
# wrong here: each is a separate process measured at ~235 MB, so three would
# add ~500 MB against 863 MB free with no swap to absorb a spike, and an OOM
# kill with no swap takes a process out rather than slowing it down. Two
# leaves ~600 MB of headroom and still gives 8-way concurrency on 2 cores,
# which is where almost all of the measured win comes from.
#
# Threads rather than more processes because these handlers are almost
# entirely WAITING — on Postgres, and in the routing path on an external HTTP
# call — so threads buy concurrency at a fraction of the memory.
#
# --timeout 60 IS NOT A REQUEST TIMEOUT HERE, and it is important not to
# believe otherwise. Measured directly: with a sync worker and --timeout 5, a
# 30-second handler is killed at 5.3s and the worker reboots; with gthread
# and the same flag it runs to completion in 30s and logs no WORKER TIMEOUT
# at all, because the arbiter watches the worker's heartbeat and the main
# thread keeps beating while a request thread is stuck. Under gthread this
# value bounds a WEDGED WORKER, not a slow request.
#
# So moving to threads removes the only runaway-request killer this app had.
# That is a deliberate trade — the same measurement shows a fast endpoint
# answering in 4ms while a 30s request is stuck, where one sync worker would
# have frozen everything — and the bound is replaced explicitly rather than
# dropped: statement_timeout and lock_timeout on the web service's sessions
# (see docker-compose.prod.yaml) bound the database-bound hangs, and the
# leg cap and short timeouts in trip/saleman_router.py bound the external
# HTTP ones. Those are the two places this app actually blocks.
#
# NO --max-requests. Recycling a worker costs a ~3s cold start (osmnx alone
# is 1.25s of it) and drops whatever that worker had in flight; on two
# workers that is a visible stall on a schedule, which is the exact symptom
# this change exists to remove. It guards against a leak nobody has observed.
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "2", \
     "--threads", "4", \
     "--worker-class", "gthread", \
     "--timeout", "60", \
     "--graceful-timeout", "30", \
     "--access-logfile", "-", \
     "--access-logformat", "%(h)s %(m)s %(U)s%(q)s %(s)s %(b)s %(D)sus", \
     "run:app"]
# CMD ["python", "run.py"]