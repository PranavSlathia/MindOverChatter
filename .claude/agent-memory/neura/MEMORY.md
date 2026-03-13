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

## Whisper Service

- Uses `faster-whisper` with `base` model, CTranslate2 backend, `int8` compute
- Lazy model loading (singleton) on first request
- `vad_filter=True` for non-speech filtering, `language=None` for auto-detect
- Dockerfile needs `libsndfile1` + `ffmpeg` system packages
- Model downloads to `/app/models` (mapped to `model-cache` Docker volume)
- 60s `start_period` appropriate for model download on first boot

## TTS Service

- Primary: `kokoro-onnx` (ONNX-based, CPU-friendly)
- Fallback: `pyttsx3` (uses espeak-ng on Linux)
- Last-resort: returns silent WAV (service stays functional)
- Dockerfile needs `libsndfile1` + `espeak-ng` system packages
- `pyttsx3` pulls in `pyobjc` on macOS (230 packages in lockfile) but slim in Docker
- Output format: 16-bit PCM WAV, streaming response
- Text limit: 5000 chars

## Voice Route Patterns

- Routes mounted at `/api` prefix (so `/api/transcribe`, `/api/tts`)
- Transcribe: proxies multipart file upload to whisper service
- TTS: validates with `SynthesizeRequestSchema`, proxies JSON to tts service, returns `audio/wav`
- Service unavailability returns 503 with `*_UNAVAILABLE` error code
- Service URLs from `env.ts`: `WHISPER_SERVICE_URL`, `TTS_SERVICE_URL`

## Research Sandbox Patterns

- Research module root: `apps/server/src/research/`
- Invariants: NEVER import `upsertBlock` in research files except `promote.ts`; NEVER import `generateAndPersistTherapyPlan` or `generateAndPersistFormulation`
- All experiment writes go to `research_*` tables only
- Read-only queries in `research/lib/read-only-queries.ts` — accepts injected `db` instance
- Sessions table has NO mode column and NO turnCount — mode is in-memory only, not persisted per-session
- `spawnClaudeStreaming` already handles `cwd: '/tmp'` and strips `CLAUDECODE` — just call it directly
- Biome auto-fix: run `npx biome check --write <files>` on new research files after writing
- Phase 1 schema files have pre-existing biome format warnings — do NOT fix them (not my files)
- CLI runner: `tsx apps/server/src/research/scripts/run-experiment.ts --experiment a|b|c|d|all --user <userId>`
- Experiment D: `--candidate-file <path>` to test a draft direction file; omit for self-evaluation baseline run
- Reports written to `research/reports/` (gitignored per Rule 4)
- `promote.ts` handles a|b|c|d — A does live upsertBlock write, B/C/D only stamp `promotedAt/By` on the row
- Experiment D (`research_replay_runs`): three-gate pipeline — Gate 1 (safety, Haiku), Gate 2 (quality scoring 0-100, Haiku), Gate 3 (PHQ/GAD trajectory, non-blocking flag only)
- Gate 1 JSON parse failure → `{passed: false, failures: ["json_parse_error"]}` (assume failed, safe default)
- Gate 2 JSON parse failure → `null` (gracefully excluded from score aggregation)
- `sanitizeForPrompt()` called on BOTH baseline and candidate content before any prompt interpolation in experiment-d
- `getSessionMessages()` in `read-only-queries.ts` — SELECT from messages WHERE sessionId ORDER BY createdAt ASC

## Therapeutic Notes

- `therapeutic-direction.md` is the Operator-editable "program.md" equivalent — mutable research surface for steering companion behaviour between sessions
- Loaded by `loadSkillFiles()` (added to targetFiles filter) and injected last by `selectRelevantSkills()` with a distinct `=== CURRENT THERAPEUTIC DIRECTION ===` header
- File must stay under 1200 characters total (injected into every session context); Operator edits Section 6 (Operator Notes) to log active experiments
- Safety constraint: the file explicitly states it never overrides crisis detection or framing rules — those remain hardcoded

## Crisis Detection

<!-- Crisis detection tuning and edge cases -->
