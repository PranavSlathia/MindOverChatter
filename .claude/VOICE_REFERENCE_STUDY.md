# Voice Reference Project Study

## Two Projects Analyzed

### 1. Vartalaap (Voice Chat bot) — Telephony Voice Bot
**Stack:** Python/FastAPI + WebSocket + Deepgram STT + Groq LLM + Piper/ElevenLabs TTS + Plivo telephony

### 2. PRSNL — WebRTC Voice Chat via Pipecat
**Stack:** Python/FastAPI + Pipecat + Daily.co WebRTC + SileroVAD + GroqSTT + GroqLLM + CartesiaTTS

---

## Unified Technology Map

| Component | Vartalaap | PRSNL | Recommendation for MindOverChatter |
|-----------|-----------|-------|-------------------------------------|
| **VAD** | Server-side energy threshold (`is_speech()` with `barge_in_threshold=500.0`) | **SileroVAD** (Pipecat built-in, `min_volume=0.3`) | SileroVAD — better accuracy, used in production |
| **STT** | **Deepgram** (streaming WebSocket, Nova-2, `utterance_end_ms=600`) | **Groq Whisper** (`whisper-large-v3-turbo`, via Pipecat) | Groq Whisper — key available, cheaper, adequate quality |
| **LLM** | Groq (`llama-3.3-70b-versatile`, streaming) | Groq (`llama-3.1-8b-instant` for voice, `llama-3.3-70b` for chat) | **Claude via CLI** (our decision) — but Groq as fast fallback for supervision |
| **TTS** | Piper (self-hosted, Hindi) → ElevenLabs (cloud fallback) | **Cartesia** (`sonic-3`, voice ID specific) | Cartesia — key available, streaming, low latency |
| **Transport** | WebSocket (Plivo telephony protocol) | **Daily.co WebRTC** (Pipecat DailyTransport) | Daily.co — key available, handles audio encoding/decoding/echo cancellation |
| **Pipeline Framework** | Custom async pipeline (`VoicePipeline` class) | **Pipecat** (frame-based pipeline) | Pipecat — handles VAD+STT+LLM+TTS pipeline orchestration out of the box |

---

## API Keys Available (from .env files)

| Service | Key Source | Status |
|---------|-----------|--------|
| **GROQ_API_KEY** | Both projects | available in both projects' `.env` |
| **DAILY_API_KEY** | PRSNL | available in PRSNL `.env` |
| **CARTESIA_API_KEY** | PRSNL | `sk_car_E45RGx...` |
| **CARTESIA_VOICE_ID** | PRSNL | `95d51f79-c397-46f9-b49a-23763d3eaa2d` |
| **DEEPGRAM_API_KEY** | Vartalaap | available in Vartalaap `.env` |
| **ELEVENLABS_API_KEY** | Vartalaap | `sk_71061028...` |

---

## Deep Dive: PRSNL Pipecat Architecture (Primary Reference)

### Pipeline: `SileroVAD → GroqSTT → GroqLLM → CartesiaTTS` via DailyTransport

**File:** `backend/app/services/pipecat/bot.py`

#### VAD Configuration
```python
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

user_aggregator_params = LLMUserAggregatorParams(
    vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.3)),
    user_turn_stop_timeout=settings.PIPECAT_VOICE_USER_TURN_STOP_TIMEOUT_SECS,
)
```
- SileroVAD runs server-side inside Pipecat
- `min_volume=0.3` — lowered from default 0.6 for mobile microphones
- Turn stop timeout is configurable via settings

#### STT (Speech-to-Text)
```python
stt = GroqSTTService(
    api_key=groq_api_key,
    model="whisper-large-v3-turbo",
)
```
- Groq's hosted Whisper (not local)
- `whisper-large-v3-turbo` — fast, good quality
- Streaming via Pipecat's frame pipeline

#### TTS (Text-to-Speech)
```python
from pipecat.services.cartesia.tts import CartesiaTTSService

tts = CartesiaTTSService(
    api_key=settings.CARTESIA_API_KEY,
    voice_id="95d51f79-c397-46f9-b49a-23763d3eaa2d",
    model="sonic-3",
)
```
- Cartesia Sonic-3 — very low latency streaming TTS
- Specific voice ID configured
- Handles sentence-level streaming natively

#### Transport (WebRTC via Daily.co)
```python
from pipecat.transports.daily.transport import DailyParams, DailyTransport

transport = DailyTransport(
    room_url,
    token,
    "PRSNL Bot",
    DailyParams(
        audio_in_enabled=is_voice,
        audio_out_enabled=True,
    ),
)
```
- Daily.co handles all WebRTC complexity (codec negotiation, jitter buffer, echo cancellation)
- Room created via Daily REST API (`POST /v1/rooms`)
- Temporary rooms with 1-hour expiry, max 2 participants

#### Connection Flow
1. Frontend calls `POST /api/pipecat/start` with `{ mode: "voice" }`
2. Backend creates Daily room + token via Daily REST API
3. Returns `{ room_url, token, session_id }` to frontend
4. Frontend joins Daily room as participant
5. Backend spawns Pipecat bot as background task, joins same room
6. Bot pipeline: `DailyTransport(audio_in) → SileroVAD → GroqSTT → GroqLLM → CartesiaTTS → DailyTransport(audio_out)`

#### Voice Session States
```python
class VoiceSessionState(enum.Enum):
    IDLE = "idle"
    LISTENING = "listening"
    PROCESSING = "processing"
    SPEAKING = "speaking"
```

#### Barge-in (Interruption)
- Pipecat handles barge-in natively via BotInterruptionFrame
- When user speaks during bot speech, VAD triggers interrupt
- Bot stops TTS, switches to listening

#### Timeout Watchdogs
- STT timeout: 10s (cancel when TranscriptionFrame arrives)
- LLM timeout: 15s
- TTS timeout: 10s
- On timeout: bot speaks fallback text

---

## Deep Dive: Vartalaap Architecture (Secondary Reference)

### Pipeline: Custom async `VoicePipeline` class

**File:** `src/core/pipeline.py`

#### State Machine
```python
class PipelineState(Enum):
    IDLE = auto()       # Waiting for user speech
    LISTENING = auto()  # Receiving user speech (STT active)
    PROCESSING = auto() # LLM generating response
    SPEAKING = auto()   # TTS playing response
    INTERRUPTED = auto() # Barge-in detected, cancelling TTS
```

#### Barge-in Implementation
```python
# In process_audio_chunk():
if (
    self._state == PipelineState.SPEAKING
    and self._config.barge_in_enabled
    and is_speech(audio_bytes, threshold=self._config.barge_in_threshold)
):
    await self._handle_barge_in(sender)
```
- `is_speech()` — energy-based VAD (checks if audio chunk exceeds threshold)
- On barge-in: sets `_tts_cancel_event`, calls `sender.clear_audio()`, resets to LISTENING

#### STT (Deepgram Streaming)
```python
options = LiveOptions(
    model="nova-2",
    language="hi",
    detect_language=True,
    smart_format=True,
    punctuate=True,
    interim_results=True,
    utterance_end_ms=600,    # 600ms silence = utterance end
    vad_events=True,         # Voice activity detection from Deepgram
    encoding=encoding,       # linear16 or mulaw
    sample_rate=sample_rate, # 16000Hz
)
```
- Real WebSocket streaming to Deepgram
- `utterance_end_ms=600` — natural speech pause detection
- `speech_final` event marks end of complete utterance
- Language detection built-in (Hindi/English/Hinglish)

#### TTS: Piper (self-hosted) → ElevenLabs (fallback)
- Piper: sherpa-onnx inference, CPU-friendly, Hindi voice
- Synthesizes complete text → chunks into 50ms pieces for streaming
- ElevenLabs: cloud fallback with streaming API
- Provider cascade with auto-failover

#### WebSocket Protocol (Plivo)
- JSON messages with events: `start`, `media`, `dtmf`, `stop`
- Audio payload: base64-encoded PCM16 or μ-law
- Bidirectional: receives caller audio, sends bot audio
- `clear` event for barge-in buffer flush

---

## Key Architectural Insight

**PRSNL uses Pipecat + Daily.co — this is the superior approach for MindOverChatter because:**

1. **Pipecat handles the hard parts**: VAD, interruption, frame pipeline, aggregation
2. **Daily.co handles WebRTC**: echo cancellation, codec negotiation, jitter buffers — we don't build any of this
3. **Cloud services for STT/TTS**: Groq Whisper + Cartesia = minimal latency, no local model management
4. **All API keys already available**: DAILY_API_KEY, CARTESIA_API_KEY, GROQ_API_KEY

**What Vartalaap adds**: The custom pipeline pattern (state machine, barge-in detection, audio buffer) is useful reference for understanding what Pipecat does under the hood, and for any edge cases where we need custom behavior.

---

## Recommended Stack for MindOverChatter Voice

| Component | Choice | Key Available | Source |
|-----------|--------|---------------|--------|
| Pipeline framework | **Pipecat** | — (open source) | PRSNL |
| WebRTC transport | **Daily.co** | ✅ available | PRSNL |
| VAD | **SileroVAD** (via Pipecat) | — (bundled) | PRSNL |
| STT | **Groq Whisper** (`whisper-large-v3-turbo`) | ✅ available | PRSNL |
| TTS | **Cartesia** (`sonic-3`) | ✅ `sk_car_E45...` | PRSNL |
| LLM | **Claude CLI** (for main response) | ✅ (CLI auth) | MindOverChatter |
| LLM (fast/supervision) | **Groq** (`llama-3.1-8b-instant`) | ✅ | PRSNL |
| Voice ID | Cartesia `95d51f79-c397-...` | ✅ | PRSNL |

### The One Custom Piece: Claude CLI Integration

PRSNL uses `GroqLLMService` inside Pipecat's pipeline. We need to replace this with a custom Pipecat processor that:
1. Receives transcribed text from STT
2. Pipes it to Claude CLI (`claude --model sonnet --print --output-format stream-json`)
3. Streams response tokens back into the Pipecat pipeline
4. Feeds tokens to CartesiaTTS for streaming synthesis

This is the only non-standard piece. Everything else is off-the-shelf from the PRSNL codebase.
