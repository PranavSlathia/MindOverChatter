# MindOverChatter - Tech Stack

> AI-Powered Hinglish Mental Wellness Companion

---

## Stack Summary

| Layer | Choice | Version |
|---|---|---|
| **Language** | TypeScript (full-stack) | 5.x |
| **Runtime** | Node.js | 22 LTS |
| **Monorepo** | Turborepo + pnpm workspaces | latest |
| **Package Manager** | pnpm | 9.x |
| **Frontend** | React + Vite + TypeScript | React 19, Vite 6 |
| **UI Components** | shadcn/ui + Tailwind CSS v4 | latest |
| **State Management** | Zustand | 5.x |
| **Backend** | Hono | 4.x |
| **AI Engine** | Claude CLI (local binary spawning) | latest |
| **AI Models** | Anthropic Claude Sonnet 4 (primary) + Haiku (safety/supervisor) | latest |
| **Real-time** | SSE (Server-Sent Events via Hono `streamSSE`) | latest |
| **Database** | PostgreSQL 16 + pgvector | pg16, pgvector 0.7+ |
| **ORM** | Drizzle ORM | latest |
| **AI/ML Microservices** | Python 3.11+ (uv) in Docker | per-service |
| **Containerization** | Docker Compose | latest |
| **Testing** | Vitest (unit/integration) + Playwright (E2E) | latest |
| **Auth** | None (personal use, single-user scope) | -- |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      TURBOREPO MONOREPO                     │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────┐   │
│  │  apps/web    │   │ apps/server  │   │ packages/     │   │
│  │  React+Vite  │   │ Hono+CLI     │   │ shared types  │   │
│  │  shadcn/ui   │   │ Drizzle ORM  │   │ validators    │   │
│  │  Zustand     │   │ SSE stream   │   │ constants     │   │
│  │  Human.js    │   │ Claude CLI   │   │               │   │
│  └──────┬───────┘   └──────┬───────┘   └───────────────┘   │
│         │                  │                                │
│         │    REST + SSE    │                                │
│         └──────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
              │                    │
              │                    │   HTTP
              │                    │
     ┌────────┴────────┐   ┌──────┴──────────────────┐
     │   PostgreSQL 16  │   │  Python AI Microservices │
     │   + pgvector     │   │  (Docker Containers)     │
     │                  │   │                          │
     │  - sessions      │   │  ┌─────────────────┐    │
     │  - memories      │   │  │ whisper-service  │    │
     │  - assessments   │   │  │ faster-whisper   │    │
     │  - mood_logs     │   │  └─────────────────┘    │
     │  - embeddings    │   │  ┌─────────────────┐    │
     │                  │   │  │ emotion-service  │    │
     │                  │   │  │ librosa          │    │
     │                  │   │  │ (rule-based)     │    │
     │                  │   │  └─────────────────┘    │
     │                  │   │  ┌─────────────────┐    │
     │                  │   │  │ tts-service      │    │
     │                  │   │  │ Kokoro TTS       │    │
     │                  │   │  └─────────────────┘    │
     └──────────────────┘   └─────────────────────────┘
```

---

## Monorepo Structure

```
moc/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .claude/
│   ├── skills/                    # Therapeutic framework skills
│   │   ├── cbt-thought-record.md  # CBT session protocol
│   │   ├── mi-oars.md            # Motivational Interviewing
│   │   └── crisis-detection.md   # Crisis safety rails
│   └── agents/                   # Custom agent definitions
│
├── apps/
│   ├── web/                      # React frontend
│   │   ├── src/
│   │   │   ├── components/       # shadcn/ui + custom
│   │   │   ├── hooks/            # Custom React hooks
│   │   │   ├── stores/           # Zustand stores
│   │   │   ├── lib/              # Human.js, utils
│   │   │   ├── pages/            # Route pages
│   │   │   └── styles/           # Tailwind + calming theme
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── server/                   # Hono backend
│       ├── src/
│       │   ├── routes/           # Hono route handlers
│       │   ├── sse/              # SSE streaming handlers
│       │   ├── sdk/              # Claude CLI integration + session lifecycle
│       │   ├── db/               # Drizzle schema + migrations
│       │   └── services/         # Business logic
│       ├── drizzle.config.ts
│       └── package.json
│
├── packages/
│   ├── shared/                   # Shared types, validators, constants
│   │   ├── src/
│   │   │   ├── types/            # Session, Mood, Assessment types
│   │   │   ├── validators/       # Zod schemas
│   │   │   └── constants/        # Emotion labels, crisis keywords
│   │   └── package.json
│   └── ui/                       # Shared UI components (optional)
│
├── services/                     # Python AI microservices
│   ├── whisper/                  # STT service
│   │   ├── Dockerfile
│   │   ├── pyproject.toml        # uv managed
│   │   └── main.py              # FastAPI thin wrapper
│   ├── emotion/                  # Voice emotion service
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── main.py
│   ├── tts/                      # Text-to-Speech service
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── main.py
│   ├── memory/                  # Mem0 memory service
│   │   ├── pyproject.toml
│   │   └── main.py
│   └── voice/                   # Pipecat + Daily.co voice pipeline
│       ├── pyproject.toml
│       └── main.py
│
├── docker-compose.yml
└── Dockerfile                    # Multi-stage for apps/server
```

---

## Frontend Stack

### Core

| Tool | Purpose | Why |
|---|---|---|
| **React 19** | UI framework | Largest ecosystem, best Claude Code training data |
| **Vite 6** | Build tool | Fast HMR, native ESM, optimized builds |
| **TypeScript 5.x** | Type safety | End-to-end types with Drizzle + shared package |
| **shadcn/ui** | Component library | Customizable, copy-paste, CSS variable theming |
| **Tailwind CSS v4** | Styling | Utility-first, calming theme via CSS variables |
| **Zustand** | Client state | Minimal, hook-based, zero boilerplate |

### Calming UI Theme (shadcn/ui CSS Variables)

```css
/* Soft cream background, sage green primary, warm lavender accent */
--background: soft-cream;
--primary: sage-green;
--accent: warm-lavender;
/* Gentle transitions and animations throughout */
```

Theme generated via [tweakcn.com](https://tweakcn.com) targeting earth tones and organic palettes.

### Browser-Side AI

| Tool | Purpose | Details |
|---|---|---|
| **Human.js** (`@vladmandic/human`) | Facial emotion detection | Runs entirely in-browser via TensorFlow.js. 7 emotions, 15-30 FPS, ~10MB models (cacheable). Zero images leave the device -- only JSON emotion scores sent to backend. Note: `@vladmandic/human` is the actively maintained successor to the archived `face-api.js` (archived Feb 2025). For v2, the team can upgrade to ONNX Runtime Web + EmotiEffLib (HSEmotion) for state-of-the-art AffectNet accuracy. |

### Key Frontend Libraries

- **React Router** - Client-side routing
- **Recharts** or **Nivo** - Mood trend visualizations, PHQ-9/GAD-7 charts
- **date-fns** - Date manipulation
- **zod** - Runtime validation (shared with backend)

---

## Backend Stack

### Core

| Tool | Purpose | Why |
|---|---|---|
| **Hono 4.x** | HTTP framework | Ultra-fast, Web Standards, built-in SSE streaming via `streamSSE` |
| **Claude CLI** | AI conversation engine | Spawns local `claude` binary for session management, streaming, and therapeutic conversations |
| **SSE (`streamSSE`)** | Real-time streaming | Server-to-client streaming for AI responses; emotion data via POST with keep-alive |
| **Drizzle ORM** | Database access | Type-safe queries, lightweight, excellent pgvector support |
| **Zod** | Validation | Shared schemas between frontend and backend |

### Claude CLI Integration

The conversation engine spawns the **local Claude Code binary** (`claude`) via `child_process.spawn`. No separate API key management -- uses your existing Claude auth from `claude login`.

**Spawning pattern:**

- **Binary spawning**: `child_process.spawn('claude', [...flags])` with prompts piped via stdin (avoids ARG_MAX limits on large therapeutic prompts)
- **Output streaming**: `--output-format stream-json` + `--verbose` for real-time streaming of assistant responses
- **Environment isolation**: `CLAUDECODE` env var stripped from child process env (prevents nested session guard rejection)
- **Working directory**: `cwd` set to `/tmp` to avoid loading the project's own CLAUDE.md and hooks into the wellness companion context
- **Message transformation**: `stream-json` events parsed and converted to SSE events for the frontend

**Capabilities:**

- **Session management**: `--print --max-turns 1` per message turn, with full context rebuilt each turn
- **Skills**: Therapeutic frameworks (CBT, MI-OARS, probing flows) defined as `.claude/skills/*.md` files and loaded into the system prompt
- **Crisis detection**: Runs on every message before Claude is spawned; response is hard-coded, never AI-generated
- **Streaming**: `stream-json` output piped through SSE to the frontend in real-time

### Electron Migration Path

The web app architecture is designed for zero-rewrite Electron migration:
- **React frontend** -> Electron renderer process (as-is)
- **Hono server** -> Electron main process (minimal changes)
- **SSE / REST** -> Electron IPC / tRPC bridge
- **Claude CLI** -> moves from server to Electron main process (direct binary access)

### API Design

- REST endpoints for CRUD operations (sessions, assessments, mood logs)
- SSE for real-time AI conversation streaming; POST endpoints for emotion data ingestion
- Internal HTTP calls to Python AI microservices

---

## Database

### PostgreSQL 16 + pgvector

Single database for everything -- structured data + vector embeddings with full ACID transactions.

| Concern | Solution |
|---|---|
| **Relational data** | Sessions, users, assessments, mood logs |
| **Vector embeddings** | pgvector extension for memory retrieval (cosine similarity) |
| **Temporal + vector queries** | Combined SQL: `WHERE created_at >= interval AND ORDER BY embedding <=> query_embedding` |
| **Migrations** | Drizzle Kit (`drizzle-kit generate` + `drizzle-kit migrate`) |

### ORM: Drizzle

- Type-safe schema definitions in TypeScript
- Automatic type inference for queries
- pgvector column type support via `drizzle-orm/pg-core`
- Migration generation and management via Drizzle Kit

### Memory Layer: Mem0

- **Mem0** (`mem0ai/mem0`) for automatic memory extraction and retrieval
- pgvector as the Mem0 backend
- Extracts key facts from conversations automatically
- Stores across vector + key-value stores
- Retrieves memories scored by relevance, importance, recency
- 26% higher accuracy than OpenAI's memory system
- 90% token cost savings versus full-context approaches
- SOC 2 and HIPAA compliant

### Hierarchical Memory (5 Levels)

1. **Per-turn**: Emotional state, key facts extracted
2. **Session summary** (300-500 words): Themes, insights, cognitive patterns, action items
3. **Weekly rollup**: Patterns across sessions, progress on goals
4. **Monthly synthesis**: Long-term patterns, growth areas, recurring concerns
5. **User profile** (~3K tokens): Core traits, persistent patterns, long-term goals (always in context)

---

## AI/ML Microservices (Python + uv)

Each AI model runs as an isolated Python microservice in Docker, managed with `uv` for dependencies. Thin FastAPI wrappers expose HTTP endpoints consumed by the Hono backend.

### Service 1: Speech-to-Text (whisper-service)

| Component | Choice | Details |
|---|---|---|
| **STT Engine** | faster-whisper (`base`) | 4x faster than OpenAI Whisper, CTranslate2 + INT8 quantization |
| **Performance** | 13min audio in ~19s (RTX 3070 Ti) | Batch per utterance: record -> transcribe -> respond |
| **Framework** | FastAPI (thin wrapper) | Single `/transcribe` endpoint |
| **Dependency mgmt** | uv | Fast, Rust-based |

### Service 2: Voice Emotion Detection (emotion-service)

| Component | Choice | Details |
|---|---|---|
| **Primary** | librosa (rule-based prosody analysis) | Pitch (pyin), MFCCs, energy (rms), spectral features. No neural model required. |
| **Prosody** | librosa | Pitch, MFCCs, energy, spectral features extracted and scored by rules |
| **Framework** | FastAPI | Single `/analyze` endpoint returning emotion + prosody scores |
| **Dependency mgmt** | uv | |

### Service 3: Text-to-Speech (tts-service)

| Component | Choice | Details |
|---|---|---|
| **TTS Engine** | Kokoro TTS (82M params) | #1 HuggingFace TTS Arena, Hindi support, 2x real-time on CPU, <$0.06/hr, Apache 2.0 |
| **Framework** | FastAPI | Single `/synthesize` endpoint |
| **Dependency mgmt** | uv | |

---

## Hinglish NLP Models

These run within the emotion-service or as part of Claude's tool pipeline:

| Model | Purpose | Key Stat |
|---|---|---|
| **HingRoBERTa** (`l3cube-pune/hing-roberta`) | Hinglish text emotion/sentiment classification | Best Hinglish NER/sentiment. Outperforms Gemini zero-shot on code-mixed NER |
| **MuRIL** (`google/muril-base-cased`) | Romanized Hindi embedding/classification | 27% better than mBERT on transliterated Hindi |
| **AI4Bharat IndicXlit** | Roman <-> Devanagari transliteration | As-needed basis |

### Embedding Model

| Option | Details |
|---|---|
| **BAAI/bge-m3** (open-source) | Apache 2.0, 100+ languages, dense+sparse+multi-vector |
| **Voyage 3.5-lite** (API, Anthropic-recommended) | $0.02/1M tokens |

Decision: Start with **BAAI/bge-m3** self-hosted for zero API cost at personal scale.

---

## AI Conversation Layer

### Claude Models

| Model | Use Case | Cost Optimization |
|---|---|---|
| **Claude Sonnet 4** | Primary conversation engine, session summaries, CBT guidance | Prompt caching: 1-hour cache, min 1024 tokens on static system prompt + user context |
| **Claude Haiku** | Lightweight tasks: text emotion classification, quick categorization | Lower cost per token for simple classification |

### Context Budget Per Session (~120,000 tokens)

| Component | Tokens |
|---|---|
| System prompt (therapeutic framework) | ~2,000 |
| User profile / core memory | ~3,000 |
| Session summaries (recent 3-5) | ~3,000 |
| Retrieved relevant past context (10-15 chunks) | ~12,000 |
| Current conversation history | ~96,000 |
| Response reserve | ~4,000 |

### Therapeutic Frameworks (via Claude Skills)

- **CBT Thought Record Cycle**: Situation -> Automatic Thought -> Emotion -> Evidence For/Against -> Balanced Thought -> Outcome
- **MI-OARS**: Open questions, Affirmations, Reflections (2:1 ratio), Summaries
- **DARN-CAT**: Change talk detection (Desire, Ability, Reason, Need, Commitment, Activation, Taking steps)
- **Cognitive Distortion Detection**: All-or-nothing, catastrophizing, mind reading, should-statements, emotional reasoning
- **Crisis Detection**: Hard-coded escalation for suicidal ideation/self-harm -> surface 988, iCall (9152987821), Vandrevala Foundation (1860-2662-345)

---

## Clinical Assessments

| Assessment | Scale | Frequency | License |
|---|---|---|---|
| **PHQ-9** (depression) | 0-27 | Weekly | Free, no license required |
| **GAD-7** (anxiety) | 0-21 | Weekly | Free, no license required |

### Mood Tracking: Circumplex Model of Affect

- **Valence** (pleasant <-> unpleasant): -1 to +1
- **Arousal** (activated <-> deactivated): 0 to 1
- Maps to 4 quadrants: Excited, Calm, Anxious, Sad

---

## Containerization

### Docker Compose Services

```yaml
services:
  web:        # React frontend (Vite build served by nginx or Hono static)
  server:     # Hono backend + Claude CLI
  db:         # pgvector/pgvector:pg16
  whisper:    # Python: faster-whisper STT
  emotion:    # Python: librosa (rule-based prosody analysis)
  tts:        # Python: Kokoro TTS
  memory:     # Python: Mem0 + pgvector memory service
  voice:      # Python: Pipecat + Daily.co voice pipeline
```

8 services total.

---

## Testing

| Layer | Tool | Scope |
|---|---|---|
| **Unit / Integration** | Vitest | Backend services, shared validators, React components, hooks |
| **E2E** | Playwright | Full browser flows: chat UI, emotion detection, session replay |
| **API** | Vitest + supertest/hono testing helpers | Route handlers, SSE streaming handlers |

---

## Development Tooling

| Tool | Purpose |
|---|---|
| **Turborepo** | Monorepo build orchestration, task caching |
| **pnpm** | Package management, workspace linking |
| **uv** | Python dependency management (AI microservices) |
| **Biome** | Linting + formatting (replaces ESLint + Prettier, faster) |
| **Drizzle Kit** | Database migrations |
| **Docker Compose** | Local dev environment |
| **Vitest** | Testing |
| **Playwright** | E2E testing |

---

## Key Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Full TypeScript vs Python backend | **Full TypeScript** | One language, end-to-end type safety with Drizzle + shared package |
| Claude API vs CLI binary | **CLI binary** | No API keys needed, uses local Claude Code auth, spawns `claude` via child_process |
| FastAPI vs Hono | **Hono** | Full TS stack, ultra-fast, Web Standards, built-in SSE streaming via `streamSSE` |
| SQLAlchemy vs Drizzle | **Drizzle** | TypeScript-native, type-safe, lightweight, pgvector support |
| Separate vector DB vs pgvector | **pgvector in PostgreSQL** | Single DB, ACID transactions, combined temporal + vector queries |
| Monorepo vs multi-repo | **Turborepo monorepo** | Shared types, single CI, incremental builds |
| State management | **Zustand** | Minimal, hook-based, sufficient for app complexity |
| Python AI models approach | **Docker microservices** | Isolated, independently scalable, thin FastAPI wrappers |
| Auth | **None (v1)** | Single-user personal scope |
| Deployment | **Local (Docker Compose)** | Personal use, Claude Code drives operations |
| Fallback chains | **None** | Primary choices only, no fallback layers |
