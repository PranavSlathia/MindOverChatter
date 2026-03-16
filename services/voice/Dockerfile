FROM python:3.11-slim

WORKDIR /app

# System dependencies for audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends libsndfile1 ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

# Install Claude CLI (needed for ClaudeCLIProcessor)
RUN curl -fsSL https://claude.ai/install.sh | sh || true

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* .

# Install dependencies
RUN uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev

# Copy application
COPY . .

EXPOSE 8005

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
