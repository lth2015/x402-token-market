# =====================================================================
# X402 Gateway · multi-stage Dockerfile
# =====================================================================
FROM python:3.12-slim AS builder

ENV POETRY_VERSION=1.8.3 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /app
COPY pyproject.toml poetry.lock* ./
# Use committed poetry.lock for reproducible builds; fall back to generating one
# if the lock file is not present (should not happen in CI — commit the lock file).
RUN if [ -f poetry.lock ]; then \
        poetry install --only main --no-root; \
    else \
        poetry lock --no-update && poetry install --only main --no-root; \
    fi


# ── Runtime stage ─────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Non-root user
RUN groupadd -g 10001 app && useradd -u 10001 -g app -d /app -s /bin/bash app

# wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY src/ ./src/

ENV PYTHONPATH=/app/src

USER app

EXPOSE 8080
CMD ["uvicorn", "x402.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
