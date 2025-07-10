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
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "run:app"]
# CMD ["python", "run.py"]