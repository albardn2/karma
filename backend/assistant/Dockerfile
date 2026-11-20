# The in-app assistant: its own small service next to the Karma API.
#
# Built with ./backend as the context, so the package lands at /app/assistant
# and runs as `python -m assistant.server`. It does not need the API's
# dependencies: it talks to the API over HTTP with each user's own token, and
# to Postgres only for its own tables (history, usage, action log, settings).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY assistant/requirements.txt assistant/requirements.txt
RUN pip install --no-cache-dir -r assistant/requirements.txt

COPY assistant assistant
# local chat history and eval output never ship in the image (the legacy
# builder ignores Dockerfile.dockerignore, so don't rely on it alone)
RUN rm -rf assistant/data assistant/eval/results && find assistant -name __pycache__ -prune -exec rm -rf {} +

ENV ASSISTANT_HOST=0.0.0.0 \
    ASSISTANT_PORT=5077

EXPOSE 5077

# One process: a chat turn is a long-lived stream that mostly waits on the
# model, so one asyncio server with worker threads handles many at once. Scale
# by adding containers (history and settings live in Postgres, not in memory).
CMD ["python", "-m", "assistant.server"]
