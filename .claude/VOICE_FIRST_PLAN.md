# MindOverChatter — Voice-First Architecture Plan

## Status: READY FOR IMPLEMENTATION

---

## 1. Vision

Shift MindOverChatter from text-first to **voice-first** as the primary interface. Text chat becomes the fallback. The wellness companion should feel like talking to someone — not dictating to a machine.

Voice-first unlocks the full multimodal pipeline:
- **Voice emotion** (SenseVoice + librosa, weight 0.5)
- **Facial emotion** (Human.js, weight 0.3)
- **Text semantics** (Claude, weight 0.8)

Three concurrent signal streams feeding the AI's understanding of the user. No text-only wellness app has this.

---

## 2. Current State (What Exists)

### Neural Engine (Ready)
- Memory blocks injection + explicit recall instruction
- Therapy plan generation + injection (v4, rich content)
- Therapeutic calibration (de-clinicalized prompt, working)
- Session supervisor + response validator (stream-json Haiku)
- Crisis detection on every message (hard-coded responses)
- Mem0 cross-session memory (pgvector backend)
- Formulations + assessments (PHQ-9, GAD-7)
- 5-mode session system with dynamic skill injection

### Docker Services (Running)
| Service | Port | Status |
|---------|------|--------|
| PostgreSQL + pgvector | 5432 (5433 host) | Healthy |
| Whisper STT | 8001 | Built (batch — to be replaced by Groq Whisper) |
| Voice Emotion | 8002 | Built (SenseVoice + librosa) |
| TTS | 8003 | Built (Kokoro — to be replaced by Cartesia) |
| Mem0 Memory | 8004 | Healthy |

### Frontend (Working)
- Human.js facial emotion detection (browser-side, JSON only)
- Chat UI with SSE streaming
- Session management, assessments, journey page

---

## 3. Technology Stack (Finalized from Reference Study)

### Proven stack from PRSNL project — all keys available, all tested in production.

| Component | Technology | Source | Key/Status |
|-----------|-----------|--------|------------|
| **Pipeline Framework** | Pipecat | Open source | Handles VAD+STT+LLM+TTS orchestration |
| **WebRTC Transport** | Daily.co | PRSNL | `DAILY_API_KEY` available |
| **VAD** | SileroVAD (via Pipecat) | PRSNL | Bundled, `min_volume=0.3` |
| **STT** | Groq Whisper `whisper-large-v3-turbo` | PRSNL | `GROQ_API_KEY` available |
| **TTS** | Cartesia Sonic-3 (streaming) | PRSNL | `CARTESIA_API_KEY` available |
| **Voice ID** | `95d51f79-c397-46f9-b49a-23763d3eaa2d` | PRSNL | Configured |
| **Main LLM** | Claude Sonnet/Opus via CLI | MindOverChatter | CLI auth (no API key needed) |
| **Fast LLM** | Groq `llama-3.1-8b-instant` | PRSNL | For supervisor/validator tasks |

### Why Pipecat + Daily.co (not custom WebSocket)

1. **Pipecat handles the hard parts**: VAD, interruption/barge-in, frame pipeline, turn aggregation, timeout watchdogs
2. **Daily.co handles WebRTC**: echo cancellation, codec negotiation, jitter buffers, NAT traversal — zero custom code
3. **Proven in production**: PRSNL runs this exact stack with real users
4. **All API keys already available**: No new accounts or billing needed

---

## 4. Architecture Decisions (Locked)

### 4.1 Claude Access: CLI Spawn Only
**Decision:** Use Claude CLI for all AI responses. No Anthropic API keys available.

**Why this works for voice:**
- CLI overhead is ~200-500ms (reducible to ~0ms with pre-warming)
- Claude's thinking time (~1-3s to first token) is the same via CLI or API
- Token streaming speed is identical — CLI proxies the API stream
- `stream-json` + `--include-partial-messages` gives incremental text updates
- Therapeutic pause (2-3s) feels natural, not broken

**Pre-warming strategy:**
- Maintain 1 warm Claude CLI process ready at all times
- After each voice turn completes, immediately spawn the next warm process
- When user finishes speaking, warm process receives prompt via stdin

### 4.2 Transport: Daily.co WebRTC (via Pipecat)
**Decision:** Use Pipecat's DailyTransport for all voice audio. No custom WebSocket.

- Daily room created per session via REST API (`POST /v1/rooms`)
- Frontend joins room as participant via Daily SDK
- Backend Pipecat bot joins same room as bot participant
- Audio flows through Daily's WebRTC infrastructure (echo cancellation, codecs included)
- Text chat fallback via existing REST+SSE (unchanged)

### 4.3 VAD: SileroVAD (Server-Side via Pipecat)
**Decision:** VAD runs server-side inside Pipecat, not browser-side.

- SileroVAD is integrated into Pipecat's pipeline natively
- `min_volume=0.3` (lowered from default 0.6 for quiet speakers)
- Configurable `user_turn_stop_timeout` for pause detection
- No browser WASM needed — Daily handles audio transport

### 4.4 STT: Groq Whisper (Cloud)
**Decision:** Replace local Whisper Docker service with Groq's hosted Whisper.

- `whisper-large-v3-turbo` — fast, good quality
- Streaming via Pipecat's `GroqSTTService`
- Existing Docker whisper service (port 8001) becomes optional/deprecated for voice
- Key: `GROQ_API_KEY` (already available)

### 4.5 TTS: Cartesia Sonic-3 (Cloud, Streaming)
**Decision:** Replace local Kokoro Docker service with Cartesia for voice mode.

- Cartesia Sonic-3 — very low latency, streaming synthesis
- Sentence-level streaming handled natively by Pipecat
- Voice ID: `95d51f79-c397-46f9-b49a-23763d3eaa2d`
- Key: `CARTESIA_API_KEY` (already available)
- Existing Docker TTS service (port 8003) remains for text-chat TTS (optional)

### 4.6 Crisis Detection: On Transcribed Text
**Decision:** Crisis detection runs on STT output (transcribed text) before Claude responds. Same pipeline as text chat — no changes needed.

---

## 5. Target Architecture

```
┌──────────────────── Browser ─────────────────────┐
│                                                    │
│  Daily.co SDK                                      │
│    Mic → WebRTC Audio Track ─────────────────────→ Daily Cloud
│    Speaker ← WebRTC Audio Track ←──────────────── Daily Cloud
│                                                    │
│  Human.js → Emotion JSON ─────────→ REST ─────────┼──→ Server
│                                                    │
│  Chat UI ← Text + Signals ←──────── SSE ─────────┼─── Server
│  (transcript display / text fallback)              │
│                                                    │
│  Voice Controls:                                   │
│    [🎙️ Start Voice] [⏸️ Pause] [⌨️ Text Mode]    │
│                                                    │
└────────────────────────────────────────────────────┘

            ↕ WebRTC (Daily.co cloud handles codec, jitter, echo)

┌──────────────────── Server ──────────────────────┐
│                                                    │
│  Pipecat Bot (joins Daily room as participant):    │
│                                                    │
│    DailyTransport(audio_in)                        │
│      → SileroVAD (speech detection)                │
│      → GroqSTT (whisper-large-v3-turbo)            │
│      → Crisis Detection (on transcribed text)      │
│      → ClaudeCLIProcessor (custom, stream-json)    │
│      → CartesiaTTS (sonic-3, streaming)             │
│      → DailyTransport(audio_out)                   │
│                                                    │
│  Parallel (non-blocking):                          │
│    Voice Emotion Service (port 8002)               │
│    Session Supervisor (mode/skill decisions)        │
│    Mem0 memory extraction                           │
│                                                    │
│  Existing (unchanged):                             │
│    REST+SSE for text chat, sessions, assessments   │
│    Session lifecycle hooks (onStart/onEnd)          │
│    Memory blocks, therapy plan, calibration         │
│    Formulation service                              │
│                                                    │
└──────────────────────────────────────────────────┘
```

---

## 6. The One Custom Piece: ClaudeCLIProcessor

PRSNL uses `GroqLLMService` inside Pipecat. We replace it with a custom Pipecat `FrameProcessor`:

```
ClaudeCLIProcessor:
  Input: TranscriptionFrame (user's spoken text)
  Process:
    1. Assemble full prompt (system prompt + memory blocks + therapy plan + conversation history + user text)
    2. Pipe to Claude CLI (pre-warmed, stream-json)
    3. Parse stream-json events for incremental text
    4. Emit LLMTextFrame for each text chunk → feeds into CartesiaTTS
  Output: LLMTextFrame (streamed AI response text)
```

This processor plugs into Pipecat's pipeline exactly where GroqLLMService sits. Everything else (VAD, STT, TTS, transport, barge-in) works unchanged.

---

## 7. Connection Flow

1. User clicks "Start Voice" in frontend
2. Frontend calls `POST /api/voice/start` → backend creates Daily room + token
3. Frontend joins Daily room via `@daily-co/daily-js` SDK
4. Backend spawns Pipecat bot as background task, joins same room
5. Audio flows: `User mic → Daily → Pipecat(VAD→STT→Claude→TTS) → Daily → User speaker`
6. On session end: Pipecat bot disconnects, session lifecycle hooks fire (summary, memory blocks, etc.)

---

## 8. Latency Budget

| Stage | Target | Notes |
|-------|--------|-------|
| VAD speech-end detection | <100ms | SileroVAD, server-side |
| Audio transport (Daily WebRTC) | <100ms | Global infrastructure |
| STT (Groq Whisper) | <500ms | Cloud streaming |
| Voice emotion (parallel) | <500ms | Non-blocking |
| Crisis detection | <50ms | Regex (non-blocking) |
| Claude first token | 1-3s | Model thinking time, irreducible |
| First complete sentence | +0.5-1s | Depends on response |
| TTS first audio (Cartesia) | <300ms | Streaming synthesis |
| Audio back to user (Daily) | <100ms | WebRTC |
| **Total perceived latency** | **2-3.5s** | **Therapeutically natural** |

---

## 9. Voice Session State Machine

Managed by Pipecat's pipeline + custom processors:

```
IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING
                                    ↑           │
                                    └── BARGE-IN ┘
```

| State | What Happens |
|-------|-------------|
| IDLE | Mic off or session not started |
| LISTENING | SileroVAD active, waiting for speech energy |
| PROCESSING | STT complete → Claude generating response |
| SPEAKING | CartesiaTTS streaming audio to user |
| BARGE-IN | User speaks during bot speech → cancel TTS, return to LISTENING |

Barge-in is handled natively by Pipecat via `BotInterruptionFrame`.

---

## 10. Implementation Phases

### Phase V1: Pipecat Foundation
- Add Pipecat + Daily.co dependencies to backend
- Create `/api/voice/start` endpoint (mirrors PRSNL's `/api/pipecat/start`)
- Implement `ClaudeCLIProcessor` (custom Pipecat FrameProcessor)
- Basic pipeline: `DailyTransport → SileroVAD → GroqSTT → ClaudeCLI → CartesiaTTS → DailyTransport`
- Frontend: Daily.co SDK integration, "Start Voice" button
- Goal: **End-to-end voice conversation with Claude works**

### Phase V2: Session Integration
- Wire voice sessions to existing session lifecycle (create session on voice start, end on disconnect)
- Memory blocks injection at voice session start
- Therapy plan injection
- Crisis detection on transcribed text
- Conversation history persistence (transcribed turns → messages table)
- Session supervisor on each voice turn
- Goal: **Voice sessions have full memory, context, and safety like text sessions**

### Phase V3: Multimodal Integration
- Voice emotion service feeding into Claude context (parallel with STT)
- Human.js facial emotion alongside voice
- Combined emotion signal (text 0.8 + voice 0.5 + face 0.3)
- Real-time transcript display in UI while voice is active
- Goal: **Three-signal emotional understanding active during voice**

### Phase V4: Voice UX Polish
- Voice mode UI (waveform visualizer, state indicator, controls)
- Seamless voice ↔ text mode switching mid-session
- Session end via voice command or button
- Assessment flow via voice (PHQ-9 questions spoken, answers via speech)
- Timeout handling (silence detection → prompt user)
- Goal: **Voice feels like a complete, polished interface**

### Phase V5: Voice-Specific Therapeutic Features
- Tone-aware responses (Claude adjusts based on voice emotion signal)
- Pacing detection (speaking too fast = anxiety signal)
- Silence as signal (long pauses = processing heavy emotion)
- Voice-specific crisis detection (tone + keywords combined)
- Goal: **Voice provides therapeutic signal that text cannot**

---

## 11. API Keys Required

Copy these to MindOverChatter's `.env` (get actual values from PRSNL's `.env`):

```bash
# Voice-first services
DAILY_API_KEY=<from PRSNL .env>
CARTESIA_API_KEY=<from PRSNL .env>
CARTESIA_VOICE_ID=95d51f79-c397-46f9-b49a-23763d3eaa2d
GROQ_API_KEY=<from PRSNL .env or existing MoC .env>

# Additional available (from Vartalaap, for fallback)
DEEPGRAM_API_KEY=<from Vartalaap .env>
ELEVENLABS_API_KEY=<from Vartalaap .env>
```

---

## 12. What Does NOT Change

The entire neural engine stays as-is:
- Session lifecycle hooks (onStart/onEnd)
- Memory blocks injection + recall
- Therapy plan injection
- Therapeutic calibration
- Session supervisor + response validator
- Crisis detection pipeline
- Mem0 memory extraction
- Formulation service
- Assessment flow (PHQ-9, GAD-7)
- Research sandbox experiments
- 5-mode session system
- Skill injection (.claude/skills/*.md)
- Text chat via REST+SSE (fallback interface)

Voice is a **new interface layer** on top of the existing intelligence. The brain doesn't change. The body does.

---

## 13. Reference

- **PRSNL Pipecat bot**: `/Users/pronav/Downloads/PRSNL/backend/app/services/pipecat/bot.py`
- **PRSNL Pipecat connect**: `/Users/pronav/Downloads/PRSNL/backend/app/api/pipecat_connect.py`
- **Vartalaap pipeline**: `/Users/pronav/Downloads/Voice Chat bot/src/core/pipeline.py`
- **Vartalaap Deepgram STT**: `/Users/pronav/Downloads/Voice Chat bot/src/services/stt/deepgram.py`
- **Full reference study**: `.claude/VOICE_REFERENCE_STUDY.md`
