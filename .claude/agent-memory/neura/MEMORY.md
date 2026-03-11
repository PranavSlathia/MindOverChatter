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

- Session manager: `apps/server/src/sdk/session-manager.ts`
- Uses local `claude` CLI binary via `child_process.spawn` (NOT an SDK library)
- Streaming via `--output-format stream-json` (newline-delimited JSON events)
- stream-json event types: `content_block_delta` (incremental), `assistant` (full message), `result` (final)
- Model from `process.env.CLAUDE_MODEL` (defaults to "sonnet")
- Response timeout: 30s (conversation), vs 5s for crisis classifier (haiku)
- In-memory session store: `Map<string, Session>` with conversation history
- Prompt assembly: system prompt + history dialogue + new user message
- System prompt: MUST say "wellness companion", NEVER "therapist"
- Crisis detection runs in the route layer BEFORE calling `sendMessage`
- The haiku-classifier.ts uses the same spawn pattern but for classification
- Biome linter: use dot notation (not bracket) on `Record<string, unknown>`
- Pre-existing: `@types/node` missing from server package (build fails for all Node.js API usage)

## Emotion Service

- Uses librosa ONLY (no SenseVoice) — rule-based prosody heuristics
- Prosody features: pitch (pyin), energy (RMS), speaking rate (onset detection), 13 MFCCs
- Emotion labels: excited, angry, anxious, sad, calm, neutral
- Confidence range: 0.3-0.7 (conservative for rule-based)
- `soundfile` required as explicit dep (librosa uses it for audio I/O)
- Dockerfile needs `libsndfile1` system package for soundfile to work
- `librosa.pyin` can be slow on first call (~10s) — 60s Docker start_period is appropriate
- Audio validation: MIME type + file extension fallback
- Min duration: 0.5s for meaningful analysis
- NaN/Inf sanitization needed before JSON serialization (numpy edge cases)

## Therapeutic Notes

<!-- Therapeutic framework refinements -->

## Crisis Detection

<!-- Crisis detection tuning and edge cases -->
