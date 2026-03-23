# Voice Pipeline v2 Migration Plan

> Swap ClaudeCLIProcessor → GroqLLMService, add comprehensive voice metrics, adaptive reflection pauses, and Sonnet post-session analysis.

## Phase 0: Verified API Reference

### Pipecat GroqLLMService (verified from pipecat-ai 0.0.104 source)
```python
from pipecat.services.groq.llm import GroqLLMService
from pipecat.services.openai.base_llm import BaseOpenAILLMService

llm = GroqLLMService(
    api_key="gsk_...",
    model="llama-3.3-70b-versatile",
    params=BaseOpenAILLMService.InputParams(
        temperature=0.7,
        max_completion_tokens=1024,
    ),
)
```
- Streaming always enabled (hardcoded `stream=True`)
- Accepts `LLMContextFrame` from universal aggregator (already in use)
- System prompt via `LLMContext(messages=[{"role": "system", "content": ...}])`

### Key Pipecat Frame Types (verified from frames.py)
| Frame | Type | Use for |
|-------|------|---------|
| `UserStartedSpeakingFrame` | System | Turn start timing |
| `UserStoppedSpeakingFrame` | System | Turn end timing |
| `VADUserStartedSpeakingFrame` | System | Precise timing with `timestamp: float` |
| `VADUserStoppedSpeakingFrame` | System | Precise timing with `timestamp: float` |
| `BotStartedSpeakingFrame` | System | Bot response start (for latency) |
| `BotStoppedSpeakingFrame` | System | Bot response end |
| `InterruptionFrame` | System | Barge-in detection |
| `LLMFullResponseStartFrame` | Control | LLM response start |
| `LLMFullResponseEndFrame` | Control | LLM response end |
| `LLMTextFrame` | Data | Streamed text chunks |
| `TranscriptionFrame` | Data | Finalized STT text |
| `TTSSpeakFrame` | Data | Speak without LLM (for reflections) |
| `LLMMessagesAppendFrame` | Data | Inject context mid-session |

### Context Mutation (verified from llm_context.py)
```python
# Append a message to context (thread-safe via pipeline frame)
from pipecat.frames.frames import LLMMessagesAppendFrame
await task.queue_frame(LLMMessagesAppendFrame(
    messages=[{"role": "system", "content": "fresh memories..."}],
    run_llm=False,  # don't trigger response, just inject
))

# Direct mutation (if you have a reference to context)
context.add_message({"role": "system", "content": "..."})
```

### Reflection Prompt Injection (verified — same pattern as CrisisCheckProcessor)
```python
# Speak directly to user without going through LLM
from pipecat.frames.frames import TTSSpeakFrame
await task.queue_frame(TTSSpeakFrame(
    text="Let's take a moment to breathe together...",
    append_to_context=True,  # adds as assistant message in context
))
```

### Existing Backend Endpoints (verified from voice.ts)
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/voice/start` | Create Daily room, spawn Pipecat bot |
| `POST` | `/api/voice/stop` | Stop voice pipeline (does NOT end MoC session) |
| `POST` | `/api/voice/check-turn` | Live crisis gate per user turn |
| `POST` | `/api/voice/transcript` | Persist transcript turns to messages table |

### Anti-Patterns to Avoid
- Do NOT use deprecated `OpenAILLMContext` — use `LLMContext` (universal)
- Do NOT use `llm.create_context_aggregator()` — deprecated since 0.0.99
- Do NOT use `StartInterruptionFrame` — deprecated, use `InterruptionFrame`
- Do NOT call `context.set_messages()` from outside pipeline — use `LLMMessagesAppendFrame` via `task.queue_frame()` for thread safety
- Voice stop does NOT end the MoC session — `POST /api/sessions/:id/end` must be called separately

---

## Phase 1: Swap ClaudeCLIProcessor → GroqLLMService

**Goal:** Replace the CLI process spawn with a direct API call. ~1-1.5s latency reduction per turn.

### Files to change

**`services/voice/bot.py`**
1. Remove import of `ClaudeCLIProcessor`
2. Add import: `from pipecat.services.groq.llm import GroqLLMService`
3. Add import: `from pipecat.services.openai.base_llm import BaseOpenAILLMService`
4. Replace LLM instantiation (line 485):
   ```python
   # OLD:
   llm = ClaudeCLIProcessor(model=settings.CLAUDE_MODEL)

   # NEW:
   llm = GroqLLMService(
       api_key=settings.GROQ_API_KEY,
       model=settings.GROQ_LLM_MODEL,
       params=BaseOpenAILLMService.InputParams(
           temperature=0.7,
           max_completion_tokens=1024,
       ),
   )
   ```
5. Pipeline stays identical — GroqLLMService processes same `LLMContextFrame` from the universal aggregator

**`services/voice/config.py`**
1. Add `GROQ_LLM_MODEL` setting:
   ```python
   GROQ_LLM_MODEL: str = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
   ```

**`services/voice/pyproject.toml`**
1. No changes needed — `pipecat-ai[groq]` already includes `GroqLLMService`

**`services/voice/claude_processor.py`**
1. Keep file for reference (or delete later). No longer imported.

### Verification
- [ ] Voice service starts without errors
- [ ] `GET /health` shows `groq_configured: true`
- [ ] Voice session connects, user speaks, gets a response from Llama 3.3
- [ ] System prompt (skills, memory blocks, therapy plan) is passed correctly
- [ ] Interruptions still work (barge-in terminates current response)
- [ ] Crisis check processor still fires on every user turn
- [ ] Transcript persistence still works

---

## Phase 2: Voice Metrics Collector

**Goal:** Track all voice-specific signals for Sonnet post-session analysis.

### New file: `services/voice/metrics_collector.py`

Create a `VoiceMetricsCollector` class as a Pipecat `FrameProcessor` that sits in the pipeline and passively observes frames.

**Data to collect:**

```python
@dataclass
class TurnMetrics:
    turn_index: int
    role: str  # "user" or "assistant"
    started_at: float  # time.time()
    ended_at: float
    duration_secs: float
    word_count: int
    text: str  # for cross-signal analysis
    pause_before_secs: float  # silence gap since previous turn ended
    was_interrupted: bool  # user barged in during this assistant turn

@dataclass
class EmotionReading:
    turn_index: int
    timestamp: float
    emotion_label: str
    confidence: float
    pitch_mean: float
    pitch_std: float
    energy_mean: float
    energy_std: float
    speaking_rate: float
    mfcc_summary: list[float] | None

@dataclass
class SessionMetrics:
    session_id: str
    started_at: float
    ended_at: float | None
    turns: list[TurnMetrics]
    emotions: list[EmotionReading]
    total_user_speech_secs: float
    total_silence_secs: float
    speech_to_silence_ratio: float
    interruption_count: int
    # Derived at session end:
    avg_user_turn_length_words: float
    engagement_trajectory: list[int]  # word counts over time
    emotion_arc: list[tuple[float, str, float]]  # (timestamp, label, confidence)
```

**Frames to observe (all pass-through, never consumed):**

| Frame | What to record |
|-------|---------------|
| `UserStartedSpeakingFrame` | Mark user turn start, calculate pause since last turn |
| `UserStoppedSpeakingFrame` | Mark user turn end, compute speech duration |
| `VADUserStartedSpeakingFrame` | Precise timestamp for timing |
| `VADUserStoppedSpeakingFrame` | Precise timestamp for timing |
| `TranscriptionFrame` (finalized) | User text, word count |
| `LLMFullResponseStartFrame` | Mark assistant turn start |
| `LLMFullResponseEndFrame` | Mark assistant turn end |
| `LLMTextFrame` | Accumulate assistant text |
| `BotStartedSpeakingFrame` | Audio output start (for latency) |
| `BotStoppedSpeakingFrame` | Audio output end |
| `InterruptionFrame` | Increment interruption count, mark turn as interrupted |

**Pipeline position:**
```python
pipeline = Pipeline([
    transport.input(),
    voice_emotion,        # existing - buffers audio for emotion analysis
    metrics_collector,    # NEW - observes all frames passively
    stt,
    transcript_logger,
    crisis_check,
    context_aggregator.user(),
    llm,
    tts,
    transport.output(),
    context_aggregator.assistant(),
])
```

Note: `metrics_collector` needs to observe frames flowing in BOTH directions. It should be near the top to see input frames, but also needs to see output frames (LLM responses, bot speaking). Two options:
- Option A: Single processor that registers event handlers on the PipelineTask
- Option B: Two processors — one before STT (input side) and one after TTS (output side)

**Recommended: Option A** — use Pipecat's observer pattern. Register a custom observer on the PipelineTask:
```python
class VoiceMetricsObserver:
    """Observes pipeline events for metrics collection."""

    async def on_push_frame(self, data: FramePushed):
        frame = data.frame
        # Observe all frames flowing through the pipeline
```

But since the existing code uses FrameProcessor pattern, we'll use **two lightweight processors** for consistency:
- `MetricsInputObserver` (before STT) — user speaking frames, VAD, audio
- `MetricsOutputObserver` (after TTS) — LLM response frames, bot speaking, interruptions

Both write to a shared `SessionMetrics` instance.

### Wire emotion readings into metrics

Modify `VoiceEmotionProcessor` to also write emotion results to the shared `SessionMetrics` instance. Currently it POSTs to the backend; it should also append to the local metrics collector.

### Expose metrics for retrieval

Add `get_session_metrics() -> dict` method on `SessionMetrics` that returns the full metrics bundle as a JSON-serializable dict.

### Files to change

| File | Change |
|------|--------|
| `services/voice/metrics_collector.py` | **NEW** — VoiceMetricsCollector, SessionMetrics dataclasses |
| `services/voice/bot.py` | Import and wire metrics collectors into pipeline, pass shared SessionMetrics |
| `services/voice/bot.py` | Modify VoiceEmotionProcessor to write to shared SessionMetrics |
| `services/voice/main.py` | Access SessionMetrics at session end for post-session bundle |

### Verification
- [ ] Metrics collector logs turn timing for each user/assistant turn
- [ ] Interruption events are counted
- [ ] Emotion readings appear in SessionMetrics
- [ ] `get_session_metrics()` returns complete JSON-serializable bundle
- [ ] No pipeline latency impact (all processing is passive/fire-and-forget)

---

## Phase 3: Enriched Transcript Persistence

**Goal:** Send full voice metrics bundle to backend when voice session ends, not just bare transcript.

### New endpoint: `POST /api/voice/session-complete`

Create a new backend endpoint that accepts the full metrics bundle:

```ts
VoiceSessionCompleteSchema = z.object({
  sessionId: z.string().uuid(),
  transcript: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    createdAt: z.string(),
    turnIndex: z.number(),
    durationSecs: z.number(),
    pauseBeforeSecs: z.number(),
    wordCount: z.number(),
    wasInterrupted: z.boolean(),
  })),
  emotions: z.array(z.object({
    turnIndex: z.number(),
    timestamp: z.string(),
    emotionLabel: z.string(),
    confidence: z.number(),
    pitchMean: z.number(),
    pitchStd: z.number(),
    energyMean: z.number(),
    energyStd: z.number(),
    speakingRate: z.number(),
    mfccSummary: z.array(z.number()).nullable(),
  })),
  sessionSummary: z.object({
    totalUserSpeechSecs: z.number(),
    totalSilenceSecs: z.number(),
    speechToSilenceRatio: z.number(),
    interruptionCount: z.number(),
    avgUserTurnLengthWords: z.number(),
    engagementTrajectory: z.array(z.number()),
    emotionArc: z.array(z.tuple([z.number(), z.string(), z.number()])),
  }),
})
```

### What this endpoint does:
1. Persist enriched transcript to `messages` table (same as current, but with metadata)
2. Persist voice metrics to a new `voice_session_metrics` JSONB column on `sessions` table (or a new table)
3. Append to SDK in-memory session
4. **Trigger the Sonnet post-session analysis job** (Phase 4)

### Voice service changes
Replace the current `_persist_transcript()` function in `main.py` with a new `_persist_session_complete()` that POSTs the full metrics bundle to `/api/voice/session-complete`.

### DB schema consideration
Two options:
- **Option A (simpler):** Add `voiceMetrics: jsonb` column to `sessions` table — stores the full metrics blob
- **Option B (normalized):** New `voice_turn_metrics` table with per-turn rows

**Recommended: Option A** — the metrics are consumed as a whole bundle by the Sonnet post-session job. No need to query individual turns. JSONB on sessions table is sufficient.

### Files to change

| File | Change |
|------|--------|
| `apps/server/src/routes/voice.ts` | **ADD** `/voice/session-complete` endpoint |
| `apps/server/src/db/schema/sessions.ts` | **ADD** `voiceMetrics: jsonb` nullable column |
| `services/voice/main.py` | Replace `_persist_transcript()` with `_persist_session_complete()` |
| `packages/shared/src/validators/` | **ADD** voice session complete schema (if using shared validators) |

### Migration
```bash
pnpm db:generate  # generates ALTER TABLE sessions ADD COLUMN voiceMetrics jsonb
pnpm db:migrate
```

### Verification
- [ ] Voice session end sends full metrics bundle to backend
- [ ] Transcript persists to messages table with enriched metadata
- [ ] voiceMetrics column populated on sessions row
- [ ] Existing text chat sessions unaffected (voiceMetrics remains null)

---

## Phase 4: Sonnet Post-Session Analysis

**Goal:** After voice session ends, run Claude Sonnet CLI with the full transcript + metrics for deep therapeutic analysis.

### New file: `apps/server/src/hooks/voice-post-session.ts`

Register a new onEnd hook specifically for voice sessions that bundles voice metrics into the Sonnet analysis:

```ts
registerOnEnd({
  name: "voice-post-session-analysis",
  priority: 5,  // runs early, before standard hooks
  critical: false,  // background
  async handler(ctx: OnEndContext) {
    // 1. Check if this session has voiceMetrics (voice session indicator)
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, ctx.sessionId),
    });
    if (!session?.voiceMetrics) return;  // text session, skip

    // 2. Build voice-specific analysis prompt
    const analysisPrompt = buildVoiceAnalysisPrompt(
      ctx.conversationHistory,
      session.voiceMetrics,
    );

    // 3. Spawn Claude Sonnet CLI for deep analysis
    const analysis = await spawnClaudeForAnalysis(analysisPrompt);

    // 4. Parse structured output and persist
    // - Emotion arc narrative
    // - Contradiction flags (text vs voice mismatch)
    // - Engagement trajectory assessment
    // - Prosody pattern insights
    // - Voice-specific observations for therapy plan
  },
});
```

### What the voice analysis prompt includes:
1. Full transcript with turn timing and pause durations
2. Per-turn emotion labels + confidence + raw prosody data
3. Interruption events with context
4. Engagement trajectory (word counts over time)
5. Emotion arc (ordered emotion readings)
6. Speech-to-silence ratio
7. Instructions to produce:
   - Voice-specific observations (e.g., "User's voice energy dropped significantly when discussing work")
   - Cross-signal contradictions (e.g., "User said 'I'm fine' but voice indicated distress")
   - Engagement assessment (opening up vs withdrawing)
   - Recommendations for therapy plan update

### Integration with existing onEnd hooks

The voice analysis output feeds INTO the existing hooks:
- `session-summary` hook receives voice observations in its context
- `therapy-plan` hook gets voice-specific recommendations
- `formulation` hook gets emotion arc data
- `user-memory-blocks` hook gets voice-derived insights

**Approach:** The voice hook runs FIRST (priority 5), persists its analysis, then the standard hooks (priority 10+) can read it.

Alternatively, inject the voice analysis into `OnEndContext` as an additional field:
```ts
interface OnEndContext {
  userId: string;
  sessionId: string;
  conversationHistory: ConversationMessage[];
  safeReason?: string;
  voiceAnalysis?: VoiceAnalysisResult;  // NEW — populated for voice sessions
}
```

### Files to change

| File | Change |
|------|--------|
| `apps/server/src/hooks/voice-post-session.ts` | **NEW** — voice analysis hook |
| `apps/server/src/hooks/session-hooks.ts` | Import and register voice hook |
| `apps/server/src/sdk/session-lifecycle.ts` | Extend `OnEndContext` with optional `voiceAnalysis` |
| `apps/server/src/sdk/session-manager.ts` | Add `spawnClaudeForAnalysis()` helper or reuse existing `spawnClaudeStreaming()` |

### Verification
- [ ] Voice session end triggers voice-post-session-analysis hook
- [ ] Sonnet CLI receives full metrics bundle in prompt
- [ ] Analysis output is structured and parseable
- [ ] Standard onEnd hooks run after voice analysis and can access results
- [ ] Text sessions skip voice hook entirely (no voiceMetrics)
- [ ] Therapy plan updated with voice-specific observations

---

## Phase 5: Adaptive Reflection Pauses

**Goal:** AI-initiated therapeutic pauses that double as background Mem0 refresh windows.

### New file: `services/voice/reflection_manager.py`

```python
class ReflectionManager:
    """Manages adaptive reflection pauses during voice sessions.

    Decides WHEN to pause (AI-driven, not timer) and WHAT to do during pause
    (short reflection vs long breathing exercise).

    During the pause:
    1. User gets a therapeutic intervention (breathing, reflection)
    2. Background: fresh Mem0 memories are fetched and injected into context
    """

    def __init__(
        self,
        context: LLMContext,
        pipeline_task: PipelineTask,
        moc_session_id: str | None,
        backend_url: str,
    ):
        self._context = context
        self._task = pipeline_task
        self._moc_session_id = moc_session_id
        self._backend_url = backend_url
        self._turn_count = 0
        self._last_refresh_turn = 0
        self._last_emotion: str | None = None
        self._last_emotion_confidence: float = 0.0

    def on_turn_complete(self, turn_text: str, emotion: str | None, confidence: float):
        """Called after each user turn. Decides whether to trigger a pause."""
        self._turn_count += 1
        self._last_emotion = emotion
        self._last_emotion_confidence = confidence

    def should_pause(self) -> tuple[bool, str]:
        """Returns (should_pause, pause_type) where pause_type is 'short' or 'long'.

        Decision logic:
        1. Every ~5 turns since last refresh → short pause
        2. High emotional intensity (confidence > 0.8) → long pause (grounding)
        3. Topic shift detected → short pause (new memories relevant)
        4. Never pause before turn 3 (let conversation establish)
        5. Never pause two turns in a row
        """
        ...
        return (should, pause_type)

    async def execute_pause(self, pause_type: str):
        """Execute a reflection pause.

        1. Push TTSSpeakFrame with therapeutic prompt
        2. Background: fetch fresh Mem0 memories
        3. Inject new memories into LLMContext via LLMMessagesAppendFrame
        """
        # Choose therapeutic intervention
        if pause_type == "long":
            text = self._get_breathing_exercise()  # 90s guided breathing
        else:
            text = self._get_reflection_prompt()   # 30s reflection

        # Speak directly (bypass LLM)
        await self._task.queue_frame(TTSSpeakFrame(
            text=text,
            append_to_context=True,
        ))

        # Background: refresh Mem0
        asyncio.create_task(self._refresh_memories())

    async def _refresh_memories(self):
        """Fetch fresh memories from backend and inject into context."""
        url = f"{self._backend_url}/api/voice/refresh-memories"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json={
                "sessionId": self._moc_session_id,
                "recentTopics": self._extract_recent_topics(),
            }) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    memories_text = data.get("memoriesBlock", "")
                    if memories_text:
                        await self._task.queue_frame(
                            LLMMessagesAppendFrame(
                                messages=[{"role": "system", "content": f"[Updated memories]\n{memories_text}"}],
                                run_llm=False,
                            )
                        )
```

### New backend endpoint: `POST /api/voice/refresh-memories`

Fetches Mem0 memories relevant to recent conversation topics and returns formatted text for injection:

```ts
// In voice.ts
app.post("/voice/refresh-memories", zValidator("json", RefreshMemoriesSchema), async (c) => {
  const { sessionId, recentTopics } = c.req.valid("json");
  // 1. searchMemories() with recent topics as query
  // 2. Format as memory block text
  // 3. Return { memoriesBlock: string }
});
```

### Integration with bot.py

The `ReflectionManager` is instantiated in `create_bot()` and wired into the pipeline:
- After each user turn (in TranscriptLogger or a new observer), call `reflection_manager.on_turn_complete()`
- Check `should_pause()` — if true, call `execute_pause()` before the next LLM response

### Breathing exercises and reflection prompts

Hardcode a pool of therapeutic interventions:
```python
BREATHING_EXERCISES = [
    "Let's take a moment together. Breathe in slowly for four counts... hold for four... and breathe out for six. Again...",
    "I'd like us to pause here. Close your eyes if you're comfortable. Take three deep breaths, feeling your feet on the ground...",
]

REFLECTION_PROMPTS = [
    "Take a moment to sit with what you just shared. There's no rush.",
    "Let that thought settle for a moment. Notice what comes up.",
    "That's important. Let's let it breathe for a second before we continue.",
]
```

### Files to change

| File | Change |
|------|--------|
| `services/voice/reflection_manager.py` | **NEW** — ReflectionManager class |
| `services/voice/bot.py` | Instantiate ReflectionManager, wire to pipeline |
| `apps/server/src/routes/voice.ts` | **ADD** `/voice/refresh-memories` endpoint |

### Verification
- [ ] Reflection pauses trigger after ~5 turns
- [ ] High-emotion turns trigger grounding exercises
- [ ] Breathing exercise audio plays smoothly via TTS
- [ ] Mem0 memories refresh in background during pause
- [ ] Fresh memories appear in subsequent LLM context
- [ ] No pauses before turn 3 or two turns in a row
- [ ] Pipeline doesn't stall during pause

---

## Phase 6: End-to-End Integration & Testing

### Voice session lifecycle (complete flow)

```
1. Frontend: POST /api/voice/start { sessionId? }
   → Backend: bootstrap.ts assembles context (memory blocks, therapy plan, skills, Mem0)
   → Backend: POST voice-service/start { system_prompt, moc_session_id }
   → Voice service: creates Daily room, spawns Pipecat bot with GroqLLMService
   → Returns: { url, token, sessionId, voiceSessionId }

2. Frontend: joins Daily room via WebRTC
   → Real-time: SileroVAD → GroqSTT → GroqLLM (full context) → CartesiaTTS
   → Per-turn: CrisisCheckProcessor gates each user turn
   → Per-turn: VoiceEmotionProcessor analyzes prosody (fire-and-forget)
   → Per-turn: VoiceMetricsCollector records timing/engagement/interruptions
   → Every ~5 turns: ReflectionManager triggers therapeutic pause + Mem0 refresh

3. Frontend: POST /api/voice/stop { voiceSessionId }
   → Voice service: bot exits, _persist_session_complete() sends full metrics bundle
   → Backend: POST /api/voice/session-complete receives enriched data
   → Backend: persists transcript + voiceMetrics to DB

4. Frontend: POST /api/sessions/:id/end
   → Backend: endSdkSession(), fetches all messages
   → Backend: runOnEnd() triggers hook chain:
     a. voice-post-session-analysis (priority 5, background)
        — Sonnet CLI analyzes transcript + voice metrics
     b. session-summary (priority 10, critical)
        — includes voice analysis in context
     c. formulation (priority 20, background)
     d. therapy-plan (priority 30, background)
     e. therapeutic-calibration (priority 40, background)
     f. user-memory-blocks (priority 50, background)
```

### Testing checklist
- [ ] Full voice session: connect, talk 10+ turns, get responses, end session
- [ ] Latency: first response < 2 seconds (vs ~4-9s with CLI)
- [ ] Context quality: Groq follows probing skills, uses memory blocks
- [ ] Crisis detection: trigger phrase during voice → hardcoded response
- [ ] Interruptions: barge-in stops current response
- [ ] Metrics: session end produces full metrics bundle
- [ ] Reflection pauses: breathing exercise plays, memories refresh
- [ ] Post-session: Sonnet analysis runs, therapy plan updates
- [ ] Text chat: completely unaffected by all changes
- [ ] Existing tests: `pnpm turbo test` passes

### Migration safety
- `claude_processor.py` is kept but not imported (no breaking changes)
- New `voiceMetrics` column is nullable (existing sessions unaffected)
- New endpoints are additive (no existing endpoints changed)
- All voice-specific logic is gated on `session.voiceMetrics != null`

---

## Execution Order

| Phase | Dependencies | Agent(s) | Estimated scope |
|-------|-------------|----------|-----------------|
| 1 | None | Neura | Small — 2 file changes |
| 2 | Phase 1 working | Neura | Medium — new file + bot.py changes |
| 3 | Phase 2 | Forge + Neura | Medium — new endpoint + schema change + voice service |
| 4 | Phase 3 | Neura | Medium — new hook + Sonnet integration |
| 5 | Phase 1 (can parallel with 2-4) | Neura | Medium — new file + bot.py + backend endpoint |
| 6 | All phases | Vigil | Testing and validation |
