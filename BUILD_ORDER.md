# MindOverChatter — Build Order Plan

## Guiding Principles

- **Text-first, voice later** — voice is v1 but lower priority than core text conversation
- **Each phase must be independently testable** — no phase ships without passing its checklist
- **Crisis detection before any user-facing conversation** — safety is non-negotiable
- **Database and types first** — everything depends on them
- **Single-user, no auth** — keep the stack lean

---

## Phase 0: Foundation (Database + Types + Docker)

**Agent**: Forge
**Goal**: Working database, shared types, Docker Compose with all 7 services booting (even if services return 501)

- Drizzle schema: `user_profiles`, `sessions`, `messages`, `emotion_readings`, `mood_logs`, `assessments`, `memories`, `session_summaries`
- pgvector extension enabled
- Docker Compose: all 7 services with health checks
- Shared Zod validators in `packages/shared`
- Hono server boots and responds to health check
- React app boots with routing shell

**Exit criteria**: `docker compose up` starts all 7 services, health checks pass, `pnpm turbo build` succeeds.

---

## Phase 1: Crisis Detection (Safety-First)

**Agent**: Neura → Vigil (mandatory)
**Goal**: Crisis detection pipeline working and exhaustively tested BEFORE any conversation feature

- Stage 1: Deterministic keyword matching (English + Hinglish)
- Stage 2: Claude Haiku classification
- Hard-coded crisis response (never AI-generated)
- `PreToolUse` hook registered
- Vigil: exhaustive test suite including Hinglish edge cases
- **This MUST pass before proceeding**

**Exit criteria**: All crisis detection tests pass. No false negatives on known crisis phrases. Hard-coded response verified for every trigger path.

---

## Phase 2: Core Conversation (Text Chat)

**Agent**: Neura (SDK) + Forge (routes) + Pixel (UI)
**Goal**: End-to-end text conversation with Claude working via SSE

- SDK session manager: create, query (streaming), end
- System prompt with therapeutic framework (blended CBT + MI-OARS + open exploration)
- Hono routes:
  - `POST /api/sessions` — create session
  - `POST /api/sessions/:id/messages` — send message
  - `POST /api/sessions/:id/end` — end session
  - `GET /api/sessions/:id/events` — SSE stream
- Message transformer: SDK streaming → SSE events
- React chat UI: message input, streaming response display, session controls
- Session end triggers (explicit button, inactivity timeout, orphan detection)
- Sentinel review after implementation

**Exit criteria**: User can open app, start a session, send text messages, see streaming AI responses, and end the session. Crisis detection is active on every message.

---

## Phase 3: Memory System

**Agent**: Neura (Mem0) + Forge (DB)
**Goal**: Cross-session memory working — facts extracted, memories retrieved at session start

- Mem0 Python microservice (port 8004) running in Docker
- `PostToolUse` hook for fact extraction (fire-and-forget)
- Typed memories: profile_fact, relationship, goal, coping_strategy, recurring_trigger, life_event, symptom_episode, unresolved_thread, safety_critical, win
- Memory provenance: source_session_id, source_message_id, confidence, last_confirmed_at, superseded_by
- Contradiction handling: old memories superseded (not deleted) when contradicted
- Session summary generation on end
- Memory retrieval at session start (blocking)
- Context assembly with full budget (~120K tokens)
- Hierarchical summarization: per-turn, session, weekly, monthly
- User journey timeline queries (longitudinal change over time)

**Exit criteria**: Start a new session and verify the AI references typed facts from the previous session. Memory provenance and contradiction tracking works. Session summaries visible in DB.

---

## Phase 4: Emotion & Mood

**Agent**: Pixel (Human.js) + Forge (endpoints) + Neura (emotion service)
**Goal**: Browser-side facial emotion + mood tracking working

- Human.js integration in React (webcam emotion detection)
- `POST /api/emotions` endpoint
- Mood tracking with Circumplex Model (valence + arousal)
- Mood visualization (basic chart)
- Emotion service Python microservice (SenseVoice + librosa)
- Privacy: clear indicator, opt-out, no images transmitted

**Exit criteria**: Webcam emotion detection runs in-browser with user opt-in. Mood entries stored in DB. Basic mood chart renders.

---

## Phase 5: Voice Pipeline

**Agent**: Neura (Python services) + Pixel (UI) + Forge (routes)
**Goal**: Voice input and TTS output working

- Whisper Python microservice (faster-whisper)
- TTS Python microservice (Kokoro)
- Audio recording UI component
- Voice input → transcription → conversation flow
- TTS response playback
- Parallel audio processing (STT + emotion in parallel)

**Exit criteria**: User can speak into mic, see transcription, get AI text response, and hear TTS playback. Latency under 3s for transcription.

---

## Phase 6: Therapeutic Features

**Agent**: Neura (skills) + Pixel (UI)
**Goal**: Therapeutic techniques and assessments integrated

- CBT Thought Record flow (UI + prompts)
- MI-OARS conversational style in system prompt
- Structured assessment ladder: PHQ-9, GAD-7 + branching screeners (sleep, panic, trauma, mania, functioning, substance, relationship)
- Human-authored probing flows for top 5 use cases (depression, anxiety, panic, grief/loneliness, relationship conflict)
- Structured symptom formulation output (hypotheses with confidence, evidence, duration, impairment)
- Adaptive entry point logic (match user's tone)
- HingRoBERTa / MuRIL for local text emotion classification
- User profile management

**Exit criteria**: Thought Record UI works end-to-end. Assessments score correctly and produce structured hypotheses. Probing flows collect required evidence for each use case. Local NLP models load and classify in Docker.

---

## Phase 7: Polish & Integration

**Agent**: Pixel (UI) + Sentinel (review) + Vigil (E2E)
**Goal**: Everything connected, tested, polished

- Calming UI theme (sage green, warm lavender, soft cream)
- Session history view
- Mood trends dashboard
- Weekly/monthly rollup visualization
- Full E2E test suite (Playwright)
- Sentinel code review of entire codebase
- Vigil therapeutic safety validation
- Performance optimization

**Exit criteria**: Playwright E2E suite green. Sentinel review signed off. Vigil safety validation passed. All Docker services healthy under load.

---

## Dependency Graph

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                                       │
                              ┌────────┤
                              ▼        ▼
                          Phase 4   Phase 5
                              │        │
                              └────┬───┘
                                   ▼
                               Phase 6 ──► Phase 7
```

- **Phase 0** is the foundation — everything depends on it.
- **Phase 1** must complete before any user-facing conversation (Phase 2).
- **Phase 2** depends on Phase 1 (crisis detection wraps every message).
- **Phase 3** depends on Phase 2 (needs working sessions to extract memories from).
- **Phase 4 and Phase 5 can run in parallel** after Phase 3.
- **Phase 6** depends on both Phase 4 and Phase 5 (therapeutic features use emotion + voice data).
- **Phase 7** is the final integration pass — depends on everything.

---

## Per-Phase Checklist Template

Use this checklist for every phase before marking it complete:

- [ ] Agent(s) assigned and spawned
- [ ] Implementation complete
- [ ] Sentinel code review passed
- [ ] Vigil test validation passed (if safety-related)
- [ ] `pnpm turbo build` passes
- [ ] Docker Compose services healthy
- [ ] Handoff document written

---

## Agent Roster

| Agent | Role | Primary Phases |
|-------|------|----------------|
| **Compass** | Planning & orchestration | All (coordination) |
| **Sentinel** | Code review & quality | All (review gate) |
| **Pixel** | Frontend (React/UI) | 0, 2, 4, 5, 6, 7 |
| **Forge** | Backend (Hono/Drizzle) | 0, 2, 3, 4, 5 |
| **Neura** | AI/SDK/Python services | 1, 2, 3, 4, 5, 6 |
| **Vigil** | Testing & safety | 1, 7 (and ad-hoc) |
