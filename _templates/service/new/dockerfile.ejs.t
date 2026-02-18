---
to: services/<%= name %>/Dockerfile
---
FROM python:3.11-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* .

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application
COPY . .

EXPOSE <%= port %>

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "<%= port %>"]
