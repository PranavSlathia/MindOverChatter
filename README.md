# MindOverChatter

**your brain's been yapping. time to yap back (therapeutically).**

MindOverChatter is an AI-powered mental wellness companion that actually *gets* you. No corporate meditation apps with suspiciously calm voiceovers. No "have you tried journaling?" for the 47th time. Just real, evidence-based therapeutic conversations that meet you where you're at.

---

## what even is this

Think of it as your pocket therapist that doesn't charge $200/hour and never cancels on you. MindOverChatter uses multimodal AI to understand not just *what* you're saying, but *how* you're saying it — your voice, your face, all of it.

**the vibe check stack:**
- Real-time voice emotion analysis (it knows when you say "I'm fine" but you're not fine)
- Facial expression recognition via Human.js (your face is a terrible liar, we use that — and zero images leave your browser)
- CBT and Motivational Interviewing techniques (actual therapy stuff, not just vibes)
- Bilingual support (English + Hinglish, because code-switching is valid)
- Crisis detection on every single message with instant helpline routing (we take the serious stuff seriously)
- Cross-session memory that actually remembers your story (not goldfish-brained like most chatbots)
- Structured assessments (PHQ-9, GAD-7 + branching screeners) that track your progress over time
- A Journey page that synthesizes your patterns, wins, triggers, and growth into something meaningful

## how it works

```
you: *talks about your day*
MindOverChatter: *actually listens*
                 *analyzes vocal emotion + facial cues*
                 *responds with evidence-based therapeutic techniques*
                 *remembers context across sessions like a real therapist would*
                 *tracks your patterns and growth over time*
you: "this is better than my last therapist"
```

## what you get

**Chat** — the main event. streaming AI conversations with real-time thinking indicators, crisis detection, and in-session assessments.

**Journey** — your personal growth dashboard. AI-generated insights about your patterns, a mood trajectory chart, session timeline, and actionable next steps. not a dry data dump — warm, reflective, actually useful.

**History** — every past session, expandable with full message transcripts. continue where you left off or review what you talked about.

**Mood Tracker** — log how you're feeling (valence + arousal), see trends over time via charts. mood data feeds into your Journey insights.

**Voice Chat** — live voice mode powered by Pipecat + Daily.co. talk to MindOverChatter like you would a real person, with real-time STT and TTS, crisis detection still active on every utterance.

**Profile** — your core traits, goals, and patterns. the AI uses these to personalize conversations.

**Assessments** — PHQ-9, GAD-7, plus branching screeners for sleep, panic, trauma, mania, functioning, substance use, and relationships. server-scored, never showing raw numbers — just human-readable severity descriptions.

**Settings** — CLI auth status, service health checks, model configuration.

## tech under the hood

Turborepo monorepo because we're organized like that.

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | React 19 + Vite 6 + Tailwind v4 + Zustand | fast, pretty, no drama |
| Backend | Hono 4.x + Drizzle ORM + PostgreSQL 16 | type-safe from DB to UI via Hono RPC |
| AI Brain | Claude CLI (local) + Claude Sonnet 4 | conversations that actually think |
| Session Supervisor | Codex SDK + gpt-4.1-codex-mini | real-time skill selection + depth tracking |
| Memory | Mem0 + pgvector | cross-session memory with provenance tracking |
| Voice | faster-whisper (base) | speech-to-text that doesn't butcher Hindi |
| Emotion | Human.js (face) + librosa (voice) | reading the room (literally) |
| Voice Pipeline | Pipecat + Daily.co | live WebRTC voice with crisis gate |
| TTS | Kokoro TTS service | responds with a calming voice |
| Real-time | REST + SSE (Server-Sent Events) | instant streaming, no WebSocket drama |

**the type chain is sacred:** Drizzle schema -> Zod validators -> Hono routes -> Hono RPC client. types flow end-to-end, no codegen, no manual interfaces.

## project structure

```
moc/
  apps/
    web/          # React frontend (the pretty face)
    server/       # Hono backend (the big brain)
  packages/
    shared/       # Types, validators, constants (the glue)
  services/
    whisper/      # Speech-to-text (the ears)
    emotion/      # Voice emotion analysis (the empath)
    tts/          # Text-to-speech (the voice)
    memory/       # Mem0 memory service (the elephant brain)
    voice/        # Pipecat + Daily.co voice pipeline
```

## getting started

```bash
# clone it
git clone https://github.com/PranavSlathia/MindOverChatter.git
cd MindOverChatter

# copy env and set your DB password
cp .env.example .env

# install deps
pnpm install

# spin up Docker services (db + python microservices)
docker compose up -d

# run dev servers
pnpm dev
```

**prerequisites:** Node 20+, pnpm 9+, Docker (for PostgreSQL + Python ML services)

**services map:**

| Service | Port | What |
|---------|------|------|
| React frontend | 5173 | Vite dev server |
| Hono server | 3000 | REST + SSE API |
| PostgreSQL + pgvector | 5432 | all the data |
| Whisper service | 8001 | speech-to-text |
| Emotion service | 8002 | voice emotion analysis |
| TTS service | 8003 | text-to-speech |
| Memory service | 8004 | Mem0 + pgvector |
| Voice service | 8005 | Pipecat + Daily.co voice pipeline |

## dev commands

```bash
pnpm dev              # run all dev servers
pnpm turbo build      # build everything
pnpm turbo lint       # biome says your code is mid
pnpm turbo test       # make sure nothing's broken
pnpm db:generate      # generate drizzle migrations
pnpm db:migrate       # apply migrations
pnpm db:studio        # open drizzle studio
docker compose up -d  # start docker services
```

## the serious bit

MindOverChatter is **not** a replacement for professional therapy. It's a wellness companion — a tool to help you build awareness, practice coping skills, and access support between sessions. It never claims to be a therapist, never diagnoses, and never generates crisis responses with AI.

**Crisis detection runs on every single message.** Two-stage: deterministic keyword matching (English + Hinglish) followed by Claude Haiku classification. Crisis responses are hard-coded, never AI-generated. Helpline numbers are always one message away:

- **988** (US Suicide & Crisis Lifeline)
- **iCall** 9152987821 (India)
- **Vandrevala Foundation** 1860-2662-345 (India)

---

## the therapy engine (for the nerds and the clinicians)

*The rest of this README is intentionally casual. This section is not. If you want to understand how the therapeutic backbone actually works, read this.*

---

### Clinical Framework

MindOverChatter implements a **blended therapeutic model** drawing from:

- **Motivational Interviewing — OARS microskills** (Open questions, Affirmations, Reflections, Summaries) as the default conversational posture. The AI is never directive unless the session mode and the user's readiness warrant it.
- **Cognitive Behavioural Therapy** — Socratic questioning, thought record workflows, cognitive pattern identification surfaced in post-session summaries.
- **Person-centred / non-directive** — the system defaults to following and reflecting before leading. Insight-seeking interventions are mode-gated (see Session Mode System below).

The system never diagnoses, never uses DSM terminology with the user, and never generates crisis responses with AI. These are not configuration options; they are hard-coded invariants with startup-time contract validation.

---

### Assessment Engine

Nine validated instruments, server-scored, with branching logic:

| Instrument | Domain | Branching Triggers |
|------------|--------|--------------------|
| PHQ-9 | Depression severity | Score ≥ 10 → sleep screener, functioning screener |
| GAD-7 | Anxiety severity | Score ≥ 10 → panic screener |
| Sleep screener | Sleep quality (custom) | PHQ-9 item 3 elevated |
| Panic screener | Panic disorder | GAD-7 item 4 elevated |
| Trauma screener | PTSD indicators | PHQ-9 item 9 or specific PHQ answers |
| Mania screener | Bipolar risk | PHQ-9 item patterns |
| Functioning screener | Psychosocial impairment | Any primary screen ≥ moderate |
| Substance screener | Substance use risk | Functioning + PHQ patterns |
| Relationship screener | Interpersonal stress | PHQ-9 social withdrawal patterns |

Scores are never surfaced as numbers to the user — only human-readable severity descriptions. Raw scores and subscale breakdowns feed the formulation engine internally.

---

### Formulation Engine

After each session, a background job synthesises a **structured psychological formulation** across six wellbeing domains:

```
connection  ·  momentum  ·  groundedness  ·  meaning  ·  self_regard  ·  vitality
```

Each domain produces a `{ level, trend, evidence, contributions[] }` object that aggregates assessment subscale scores, mood log data, and memory confidence signals. The formulation then constructs:

- **Presenting theme** — the user's primary psychological focus right now
- **Roots** — historical patterns and formative experiences (sourced from memories)
- **Recent activators** — proximal stressors and triggers (sourced from session content)
- **Perpetuating cycles** — maintaining mechanisms (CBT-style behavioural analysis)
- **Protective strengths** — resilience factors and coping resources
- **Questions worth exploring** — clinically-reasoned probes, never shown as assessments
- **Action recommendations** — domain-specific, priority-ranked next-step suggestions

The formulation is the backbone of the Journey page. Data confidence is rated `sparse → emerging → established` based on signal quantity. All formulation fields are internal-only clinical notes — the user sees only a warm, translated reflection.

---

### Internal Therapy Plan

Distinct from the formulation (which models the user's state), the **therapy plan** models *how to conduct the next session*. It is generated as a background Claude call after each session and injected into the system prompt at session start. The user never sees it.

```jsonc
{
  "unexplored_areas": [            // topics not yet addressed, with clinical rationale
    { "topic", "priority", "notes", "approach" }
  ],
  "therapeutic_goals": [           // internal treatment objectives
    { "goal", "description", "progress", "visible_label" }  // progress: nascent|building|established
  ],
  "working_hypotheses": [          // always internal_only: true, never projected onto user
    { "hypothesis", "confidence", "evidence" }
  ],
  "natural_callbacks": [           // trigger topics → natural bridging questions
    { "trigger_topic", "probe_question", "priority" }
  ],
  "next_session_focus": "string",  // max 300 chars
  "recommended_session_mode":  "follow_support|assess_map|deepen_history|challenge_pattern|consolidate_close",
  "directive_authority":       "low|medium|high",
  "engagement_notes":          "string"  // max 500 chars, how to open the next session
}
```

Therapy plan versioning uses **PostgreSQL advisory locks** (`pg_advisory_xact_lock`) to prevent concurrent generation races, with a `UNIQUE(user_id, version)` constraint as a safety net. A new version is appended (never overwritten) on every session end and every completed assessment.

---

### Session Lifecycle Hooks

Session boundaries are managed through a **typed hook registry** — not scattered imperative calls:

```
onStart hooks (sequential, all awaited):
  memory-blocks-injection     → injects 7 named memory blocks into Claude context
  therapy-plan-injection      → injects internal therapy plan + initialises session mode

onEnd hooks (critical first, then background fire-and-forget):
  session-summary    [critical]     → Claude call → structured JSON → session_summaries table + sessions.summary
  formulation        [background]   → regenerates formulation from all evidence
  therapy-plan       [background]   → evolves therapy plan for next session
  clinical-handoff   [background]   → generates clinician-facing handoff report
  user-memory-blocks [background]   → rewrites 7 named memory blocks
  therapeutic-calibration [background] → updates communication style notes (see below)
```

`assertHookContract()` runs at server startup and throws synchronously if any required hook is missing or has the wrong execution class. A misconfigured registry is caught before the first request is served, not at runtime.

---

### Session Mode System

The companion operates in one of five **session modes**, which controls how it conducts the conversation. The mode is initialised from the therapy plan at session start and updated in real-time via rule-based message analysis (no LLM call):

| Mode | When | Behavioural Instruction |
|------|------|------------------------|
| `follow_support` | Distress / overwhelm detected | Follow, reflect, don't redirect. Presence is the intervention. |
| `assess_map` | Stable, picture incomplete | Open, curious questions. Map what is happening and its impact. |
| `deepen_history` | Established rapport, curiosity present | Explore roots and earlier experiences at the user's pace. |
| `challenge_pattern` | Insight readiness signals present | Gentle reframes via "I wonder…" / "What if…" — invite, never lecture. |
| `consolidate_close` | Goals largely established | Name progress, close open threads, orient toward what's next. |

**Shift detection** uses deterministic regex (English + Hinglish trigger sets) on every user message. `follow_support` always beats `challenge_pattern` — distress overrides insight. Once in `follow_support`, the session does not shift to `challenge_pattern` until the mode is reset. A `directive_authority: "low"` clamp from the therapy plan additionally blocks challenge-type shifts regardless of message content.

---

### Memory Architecture

Three independent memory layers, each with different granularity and lifetime:

**1. Mem0 episodic memories** — extracted after every session by a Claude call, stored in PostgreSQL with pgvector embeddings (BAAI/bge-m3, 1024-dim). Each memory carries:
- `memoryType`: one of 12 typed categories (`profile_fact`, `relationship`, `goal`, `coping_strategy`, `recurring_trigger`, `life_event`, `symptom_episode`, `unresolved_thread`, `safety_critical`, `win`, `session_summary`, `formative_experience`)
- Full provenance: `source_session_id`, `source_message_id`, `confidence`, `last_confirmed_at`
- Cross-system linkage: `mem0_id` links each Drizzle row back to Mem0's internal ID for reliable supersession
- Contradiction handling: memories are **superseded** (not deleted) when contradicted — the historical record is preserved. Supersession uses `mem0_id` lookup to correctly link old → new memories.

Retrieval at session start uses dual-strategy search: semantic similarity (pgvector cosine) + temporal recency, merged and capped for context budget.

**2. Named memory blocks** — 7 persistent text fields, rewritten at session end, injected at session start:

| Block | Content | Char limit |
|-------|---------|------------|
| `user/overview` | Who the user is in a paragraph | 500 |
| `user/goals` | What they are working toward | 500 |
| `user/triggers` | Known distress triggers | 500 |
| `user/coping_strategies` | What helps them cope | 500 |
| `user/relationships` | Key people in their life | 500 |
| `user/origin_story` | Developmental narrative and formative experiences | 1000 |
| `companion/therapeutic_calibration` | How to engage *this specific user* (see below) | 800 |

**3. Session summaries** — structured JSON (themes, cognitive patterns, action items) persisted after every session, feeding the formulation and therapy plan pipelines.

---

### Therapeutic Calibration

After sessions with ≥4 complete turns, a background Claude call reviews the session transcript and rewrites the `companion/therapeutic_calibration` memory block — a self-updating note on communication style for *this specific user* (e.g., "responds better to open questions before reflections", "appreciates shorter responses when distressed").

Two layers of prompt injection defence:
1. **Input sanitisation** — both the existing notes and the session transcript are stripped of delimiter patterns before interpolation
2. **Output blocklist** — the result is rejected before persistence if it contains safety bypass directives, therapist identity claims, diagnostic terminology, or crisis-adjacent content. The previous value is preserved on rejection.

---

### Two-Stage Crisis Detection

Runs on **every user message**, before the AI responds:

1. **Stage 1: Deterministic keyword matching** — regex against ~60 trigger phrases in English and Hinglish. Zero latency, zero LLM calls. A match triggers an immediate hard-coded response.
2. **Stage 2: Claude Haiku classification** — for messages that pass Stage 1 but exhibit ambiguous distress signals. The classifier returns a binary crisis/non-crisis signal.

Crisis responses are **never AI-generated**. The response is a fixed string with hardcoded helpline numbers. The session is flagged `crisis_escalated` in the database. Any change to the crisis pipeline triggers an exhaustive test suite (English + Hinglish edge cases, confirmed no false negatives).

---

### Prompt Injection Hardening

All external content injected into the Claude context is wrapped in `---BEGIN {label}---` / `---END {label}---` delimiters, with a preamble instructing the model to treat delimited content as raw data. Memory blocks, session history, skill files, and context injections are all delimited independently. User message content is never concatenated raw into the system prompt.

---

## contributing

This is currently a solo project by [@PranavSlathia](https://github.com/PranavSlathia), but the codebase is built for collaboration. Check out the docs if you're curious:

- `ARCHITECTURE.md` — system design + service map
- `TECHSTACK.md` — why we picked what we picked

## license

MIT — because mental health tools should be accessible.

---

*built with love, caffeine, and an unreasonable amount of Claude calls.*
