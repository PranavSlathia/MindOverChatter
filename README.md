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

**Profile** — your core traits, goals, and patterns. the AI uses these to personalize conversations.

**Assessments** — PHQ-9, GAD-7, plus branching screeners for sleep, panic, trauma, mania, functioning, substance use, and relationships. server-scored, never showing raw numbers — just human-readable severity descriptions.

## tech under the hood

Turborepo monorepo because we're organized like that.

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | React 19 + Vite 6 + Tailwind v4 + Zustand | fast, pretty, no drama |
| Backend | Hono 4.x + Drizzle ORM + PostgreSQL 16 | type-safe from DB to UI via Hono RPC |
| AI Brain | Claude Agent SDK + Claude Sonnet 4 | conversations that actually think |
| Memory | Mem0 + pgvector | cross-session memory with provenance tracking |
| Voice | Faster Whisper | speech-to-text that doesn't butcher Hindi |
| Emotion | Human.js (face) + SenseVoice (voice) | reading the room (literally) |
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

## contributing

This is currently a solo project by [@PranavSlathia](https://github.com/PranavSlathia), but the codebase is built for collaboration. Check out the docs if you're curious:

- `ARCHITECTURE.md` — system design + service map
- `TECHSTACK.md` — why we picked what we picked
- `BUILD_ORDER.md` — phased build plan + dependency graph

## license

MIT — because mental health tools should be accessible.

---

*built with love, caffeine, and an unreasonable amount of Claude calls.*
