# Voice Pipeline — Next Steps (March 24, 2026)

## What's Working
- Voice connection (Daily WebRTC)
- Speech-to-text (Groq Whisper)
- LLM responses (Groq LLaMA 3.3 70B)
- TTS playback (Cartesia sonic-3) — FIXED: explicit audio track attachment
- AI opening greeting in voice
- Emotion detection (librosa — basic label + confidence per turn)
- Crisis check endpoint (needs `host.docker.internal` for Docker access)
- Transcript persistence endpoint (session-complete)
- Clinical psychology system prompt

## Priority 1: Fix `--bare` Flag Impact

**Status**: Committed (`8797eb2`), needs server restart.

The `UserPromptSubmit` hook from `~/.claude/settings.json` was contaminating ALL Claude CLI sub-spawns with routing instructions (`[Category 6...]`), breaking JSON parsing for:
- Opus voice post-session analysis
- Supervisor (Gemini fallback to Haiku)
- Response validator
- Session summary / formulation / therapy plan generation

**Action**: Restart server. Verify Opus post-session analysis produces valid JSON. Verify supervisor produces structured depth/mode data.

## Priority 2: Voice Transcript Routing

**Problem**: Voice transcripts persisted via `POST /api/voice/session-complete` with correct `moc_session_id`, but NOT appearing in chat UI messages.

**Investigation needed**:
1. Check what sessionId `_persist_session_complete()` in `main.py` actually sends (line 243)
2. Check what the backend `session-complete` endpoint in `voice.ts` does with the messages
3. Verify messages land in the `messages` table with the correct `session_id`
4. Check if the SSE `voice.transcript_persisted` event triggers the frontend to reload messages

**Root cause hypothesis**: The voice service may be sending the voice-internal session ID instead of the MoC session ID, or the backend endpoint may not be inserting the messages correctly.

## Priority 3: Enriched Metrics Not Flowing

**Problem**: `MetricsInputObserver` and `MetricsOutputObserver` are in the pipeline but producing no visible output. `SessionMetrics` only gets basic emotion labels, not the full metrics bundle.

**What should be captured per turn**:
- Turn index, duration, word count
- Pause before (silence gap)
- Was interrupted (boolean)
- Emotion + prosody per turn (pitch_mean, pitch_std, energy_mean, energy_std, speaking_rate, MFCCs)

**What should be captured per session**:
- Total user speech seconds
- Total silence seconds
- Speech-to-silence ratio
- Interruption count
- Average user turn length (words)
- Engagement trajectory (word counts over time)
- Emotion arc (timestamp, label, confidence)

**Investigation needed**:
1. Add logging to `MetricsInputObserver.process_frame()` and `MetricsOutputObserver.process_frame()`
2. Check if `SessionMetrics` has data at session end via `get_session_metrics()`
3. Verify the enriched bundle sent to `/api/voice/session-complete` contains full metrics
4. If the observers aren't receiving frames, check Pipecat's frame propagation with the `setup()/cleanup()` patches

## Priority 4: Self-Interruption Issue

**Problem**: The bot keeps getting interrupted even when the user doesn't speak. Pipecat logs show 10 interruptions in a short session.

**Possible causes**:
- VAD false positives from background noise or echo
- The bot's own TTS audio feeding back into the mic
- `VAD_MIN_VOLUME` threshold (currently 0.3) may be too sensitive

**Investigation**:
1. Check if interruptions correlate with bot speaking (echo cancellation issue)
2. Try increasing `VAD_MIN_VOLUME` from 0.3 to 0.5 or 0.6
3. Check if Daily's echo cancellation is enabled in the transport params

## Priority 5: Opus Post-Session Analysis

**Status**: Hook exists (`voice-post-session.ts`), spawns Opus, but failed due to hook contamination (`--bare` fix addresses this).

**After restart, verify**:
1. Opus produces valid JSON analysis (observations, contradictions, engagement, recommendations)
2. `ctx.voiceAnalysis` is populated for downstream hooks
3. Session summary and therapy plan incorporate voice analysis data
4. `voiceMetrics` JSONB column on sessions table gets populated

## Priority 6: Redundant Primary Reviewer

**Problem**: The "primary" reviewer path in `multi-validator.ts` fails 100% of the time (0/13 success). The Gemini reviewer works (9/13 success, score 1.0). The primary reviewer is wasting a CLI spawn per turn.

**Action**: Remove the primary reviewer from `runMultiModelValidation()` or make it a Gemini-only path. The Gemini reviewer already covers therapeutic safety validation.

---

## Session Summary — March 23-24, 2026

### Commits Today (20+)

| Feature | Status |
|---------|--------|
| Voice pipeline fixes (SessionMetrics, Docker URL, sample rates) | Shipped |
| Voice audio playback (explicit track attachment) | **FIXED** |
| 7 therapeutic depth upgrades (challenge clause, probing-depth, etc.) | Shipped |
| Observability layer (turn_events, dashboard, alerts) | Shipped |
| Settings page (CLI auth, service health) | Shipped |
| Multi-model agents (Gemini reviewer, CLI spawner) | Shipped |
| AI opening message (context-aware, LLM-generated) | Shipped |
| Opus for background tasks (summary, formulation, therapy plan) | Shipped |
| Gemini→Haiku fallback chain | Shipped |
| Non-blocking supervisor (2s grace period) | Shipped |
| Voice V2 integration surface (8 backend items) | Shipped |
| Safety filter fixes (user block false positives, calibration char limit) | Shipped |
| `--bare` flag for all Claude CLI spawns | Shipped |
| Clinical psychology system prompt | Shipped |
| Journey filter (empty sessions) | Shipped |
| Docs cleanup (README, ARCHITECTURE, TECHSTACK) | Shipped |
| Competitive research (GitHub + commercial apps) | Done |
