FROM python:3.11-slim

WORKDIR /app

# System dependencies: libsndfile for audio I/O, espeak-ng for pyttsx3 fallback
RUN apt-get update && \
    apt-get install -y --no-install-recommends libsndfile1 espeak-ng && \
    rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* .

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application
COPY . .

EXPOSE 8003

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]
