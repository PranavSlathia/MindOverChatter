# Neura Memory

> SDK integration patterns, therapeutic skill refinements, crisis detection tuning.

---

## Python Service Patterns

- All services: `main.py` + `pyproject.toml` + `Dockerfile` + `uv.lock`
- Ports: whisper=8001, emotion=8002, tts=8003, memory=8004
- Dockerfile pattern: `python:3.11-slim`, copy uv from `ghcr.io/astral-sh/uv:latest`, `uv sync --frozen --no-dev`, then `uv run uvicorn`
- Use `[dependency-groups] dev = [...]` NOT `[tool.uv] dev-dependencies` (deprecated in uv)
- Health endpoint: `GET /health` -> `{"status": "ok", "service": "<name>"}`
- Lockfiles generated via `cd services/<name> && uv lock`

## SDK Patterns

<!-- Claude Agent SDK integration patterns -->

## Therapeutic Notes

<!-- Therapeutic framework refinements -->

## Crisis Detection

<!-- Crisis detection tuning and edge cases -->
