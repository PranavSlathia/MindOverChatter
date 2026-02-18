---
name: python-service-pattern
description: FastAPI microservice conventions for Python-based AI services in MindOverChatter, covering project structure, endpoints, Docker patterns, and testing.
user-invocable: false
---

# Python Service Pattern

## Purpose

Conventions for building Python AI microservices in MindOverChatter. Each service is a thin FastAPI wrapper around an ML model or processing pipeline, containerized with Docker, and managed with uv for dependency resolution.

## Project Structure

```
services/<name>/
  Dockerfile          # Multi-stage build, Python 3.11-slim base
  pyproject.toml      # uv-managed dependencies and project metadata
  main.py             # FastAPI app with endpoints
  models/             # ML model loading and inference logic (optional)
  tests/
    test_main.py      # pytest unit tests
```

Every service lives under `services/` at the repository root. The service name should be a short, descriptive noun (e.g., `whisper`, `emotion`, `tts`).

## FastAPI Thin Wrapper Pattern

Services follow a minimal pattern: load the model at startup, expose it through one or two endpoints. Keep business logic out of the endpoint functions -- delegate to model modules.

```python
from fastapi import FastAPI
from contextlib import asynccontextmanager

model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = load_model()  # Heavy loading happens once at startup
    yield
    # Cleanup if needed

app = FastAPI(title="service-name", lifespan=lifespan)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": "model-name-and-version",
        "ready": model is not None
    }

@app.post("/process")
async def process(request: ProcessRequest):
    try:
        result = model.infer(request.data)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": {"code": "INFERENCE_ERROR", "message": str(e)}}
```

## Required Endpoints

### GET /health

Every service must expose a health check endpoint. This is used by Docker health checks and the orchestration layer.

```json
{
  "status": "healthy",
  "model": "openai/whisper-large-v3-turbo",
  "ready": true
}
```

The `ready` field indicates whether the model has finished loading. Services should return `200` with `ready: false` during startup, and `200` with `ready: true` once the model is loaded and inference is available.

### POST /<action>

The primary processing endpoint. The action name should reflect what the service does:

| Service | Endpoint | Action |
|---------|----------|--------|
| whisper | POST /transcribe | Speech-to-text transcription |
| emotion | POST /analyze | Voice emotion + prosody analysis |
| tts | POST /synthesize | Text-to-speech synthesis |

Use the most natural verb for the service's function. Accept multipart form data for audio/file inputs, JSON for structured inputs.

## Response Format

All responses follow a consistent envelope:

**Success:**
```json
{
  "success": true,
  "data": {
    "text": "transcribed text here",
    "language": "hi",
    "confidence": 0.94
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "MODEL_NOT_READY",
    "message": "Model is still loading, try again in a few seconds"
  }
}
```

Common error codes:
- `MODEL_NOT_READY` -- model still loading at startup
- `INFERENCE_ERROR` -- model inference failed
- `INVALID_INPUT` -- request data validation failed
- `FILE_TOO_LARGE` -- uploaded file exceeds size limit
- `UNSUPPORTED_FORMAT` -- file format not supported

## Docker Patterns

```dockerfile
FROM python:3.11-slim AS base

WORKDIR /app

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# Model cache volume mount point
VOLUME ["/app/model-cache"]

ENV MODEL_CACHE_DIR=/app/model-cache

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${PORT}"]
```

Key Docker conventions:
- **Base image**: `python:3.11-slim` for all services
- **Dependency management**: uv (not pip) for fast, reproducible installs
- **Model caching**: Use Docker volumes mounted at `/app/model-cache` so models persist across container restarts and are not baked into images
- **Health checks**: Built into Dockerfile using the `/health` endpoint
- **No root**: Run as non-root user in production

## Existing Services

| Service | Port | Endpoint | Model | Purpose |
|---------|------|----------|-------|---------|
| whisper | 8001 | POST /transcribe | openai/whisper-large-v3-turbo | Speech-to-text with language detection |
| emotion | 8002 | POST /analyze | FunAudioLLM/SenseVoice-Small + librosa | Voice emotion classification + prosody |
| tts | 8003 | POST /synthesize | TBD | Text-to-speech for AI responses |

Port allocation: AI services use the 8001-8099 range. The main backend (Forge) runs on port 3000.

## pyproject.toml Convention

```toml
[project]
name = "moc-<service-name>"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "python-multipart>=0.0.12",
    # Model-specific dependencies here
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

## Testing

**Unit tests** with pytest:
- Test endpoint request/response contracts
- Test model inference with small fixtures
- Test error handling paths
- Mock heavy model loading for fast test runs

**Integration / smoke test** via health check:
```bash
# After docker compose up, verify service is ready
curl -f http://localhost:8001/health | jq '.ready'
```

Health checks serve as the primary integration test -- if the model loads and the endpoint responds, the service is functional.
