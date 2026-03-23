# MindOverChatter - System Architecture

> Fundamental blueprint for the AI-Powered Hinglish Mental Wellness Companion

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Topology](#2-service-topology)
3. [Data Flow Diagrams](#3-data-flow-diagrams)
4. [Claude CLI Architecture](#4-claude-cli-architecture)
5. [REST + SSE Protocol](#5-rest--sse-protocol)
6. [Database Architecture](#6-database-architecture)
7. [Memory Architecture](#7-memory-architecture)
8. [AI Pipeline Architecture](#8-ai-pipeline-architecture)
9. [Crisis Detection Pipeline](#9-crisis-detection-pipeline)
10. [Error Handling](#10-error-handling)
11. [File Storage](#11-file-storage)
12. [Security Architecture](#12-security-architecture)
13. [Electron Migration Path](#13-electron-migration-path)

---

## 1. System Overview

MindOverChatter is a multimodal mental wellness app built as a monorepo web application with Python AI microservices. The core conversation engine is the **Claude CLI**, which wraps the local Claude Code binary to drive therapy sessions programmatically.

### Design Principles

- **Single database** - PostgreSQL + pgvector for everything (relational + vectors)
- **Browser-side privacy** - Facial emotion detection runs in-browser, zero images leave the device
- **Typed everything** - End-to-end TypeScript with shared Zod schemas; Python services have typed contracts
- **No fallbacks** - Primary choices only, no fallback chains
- **Claude-native** - CLI spawns local Claude binary, skills for therapeutic frameworks

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                            │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     React Frontend (apps/web)                    │  │
│  │                                                                  │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │  │
│  │  │  Chat UI     │  │ Dashboard    │  │ Human.js               │  │  │
│  │  │  (streaming) │  │ (mood/PHQ/   │  │ (TensorFlow.js)        │  │  │
│  │  │             │  │  GAD charts) │  │ 7 emotions → JSON only │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │  │
│  │         │                │                      │               │  │
│  │         │    REST + SSE (Hono RPC)               │               │  │
│  │         └────────────────┼──────────────────────┘               │  │
│  └──────────────────────────┼──────────────────────────────────────┘  │
│                             │           │                              │
│              ┌──────────────┘     Audio Upload (HTTP)                  │
│              │                   to services directly                  │
│              │              ┌────────┴────────┐                        │
└──────────────┼──────────────┼────────────────┼────────────────────────┘
               │              │                │
               ▼              ▼                ▼
┌──────────────────┐  ┌─────────────┐  ┌─────────────┐
│   Hono Server    │  │  whisper-   │  │  emotion-   │
│   (apps/server)  │  │  service    │  │  service    │
│                  │  │             │  │             │
│  ┌────────────┐  │  │ faster-     │  │ librosa     │
│  │ Claude     │  │  │ whisper     │  │ + librosa   │
│  │ Claude CLI │  │  │ faster-     │  │             │
│  │            │  │  │ turbo       │  │ POST        │
│  │ ┌────────┐ │  │  │             │  │ /analyze    │
│  │ │ Skills │ │  │  │ POST        │  │             │
│  │ │ Hooks  │ │  │  │ /transcribe │  └─────────────┘
│  │ │ MCP    │ │  │  │             │
│  │ └────────┘ │  │  └─────────────┘  ┌─────────────┐
│  └─────┬──────┘  │                   │  tts-service │
│        │         │                   │             │
│  ┌─────┴──────┐  │                   │ Kokoro TTS  │
│  │ Drizzle ORM│  │                   │ 82M params  │
│  └─────┬──────┘  │                   │             │
│        │         │                   │ POST        │
└────────┼─────────┘                   │ /synthesize │
         │                             └─────────────┘
         ▼
┌──────────────────┐
│  PostgreSQL 16   │
│  + pgvector      │
│                  │
│  sessions        │
│  messages        │
│  emotion_readings│
│  mood_logs       │
│  assessments     │
│  memories        │
│  user_profiles   │
│  session_summaries│
│  user_formulations│
│  therapy_plans   │
│  memory_blocks   │
│  turn_events     │
└──────────────────┘
```

---

## 2. Service Topology

### Docker Compose Services

| Service | Container | Port | Responsibility |
|---|---|---|---|
| **web** | `moc-web` | 5173 | React frontend (Vite dev / nginx prod) |
| **server** | `moc-server` | 3000 | Hono backend + Claude CLI + SSE streaming |
| **db** | `pgvector/pgvector:pg16` | 5432 | PostgreSQL 16 + pgvector extension |
| **whisper** | `moc-whisper` | 8001 | faster-whisper STT (base) |
| **emotion** | `moc-emotion` | 8002 | librosa rule-based prosody analysis |
| **tts** | `moc-tts` | 8003 | Kokoro TTS (82M params) |
| **memory** | `moc-memory` | 8004 | Mem0 memory service + pgvector backend |
| **voice** | `moc-voice` | 8005 | Pipecat + Daily.co voice pipeline |

### Service Communication Map

```
web ──REST/SSE──► server ──Drizzle──► db
 │                   │
 │                   ├──HTTP──► tts (POST /synthesize)
 │                   │
 │                   └──HTTP──► memory (Mem0 search/add)
 │
 ├──HTTP──► whisper  (POST /transcribe)
 │
 ├──HTTP──► emotion  (POST /analyze)
 │
 └──WebRTC──► voice  (Pipecat + Daily.co live voice pipeline)
```

**Key pattern**: Frontend sends audio directly to Python services (parallel). Frontend sends the merged results + text to the Hono server via POST /api/sessions/:id/messages. This avoids double-hop latency for audio processing.

### Network

All services on a shared Docker network (`moc-net`). No service exposed externally except `web` (5173) and `server` (3000) for local development.

---

## 3. Data Flow Diagrams

### 3.1 Text Conversation Flow

```
User types message
        │
        ▼
[Frontend] ──POST /api/sessions/:id/messages──► [Hono Server]
                                        │
                                        ▼
                                  [Crisis Detector]
                                  (PreToolUse hook)
                                        │
                                   ┌────┴────┐
                                   │ Crisis?  │
                                   └────┬────┘
                                   NO   │   YES
                                   │    │    │
                                   ▼    │    ▼
                            [Claude CLI] │  [Hard-coded crisis
                             query()    │   response + resources]
                                   │    │
                                   ▼    │
                            [Claude Sonnet 4]
                            Context:
                            - System prompt (~500 tok)
                            - User profile (~500 tok)
                            - Last session summary (~300 tok)
                            - Retrieved memories (~1500 tok)
                            - Current history (~1200 tok)
                                   │
                                   ▼
                            [Streaming response]
                                   │
                                   ▼
                            [PostToolUse hooks]
                            - Extract emotions
                            - Extract key facts
                            - Update Mem0
                            - Write to DB via Drizzle
                                   │
                                   ▼
[Frontend] ◄──SSE stream──── [Hono Server]
        │
        ▼
  Render AI response
  (streaming, token by token)
```

### 3.2 Voice Input Flow (Parallel Processing)

```
User records audio utterance
        │
        ▼
[Frontend] captures audio blob (WebAudio API)
        │
        ├──HTTP POST──► [whisper-service /transcribe]
        │                       │
        │                       ▼
        │                 faster-whisper (base)
        │                 CTranslate2 + INT8 quantization
        │                       │
        │                       ▼
        │                 {text, language, timestamps}
        │
        └──HTTP POST──► [emotion-service /analyze]
                                │
                                ▼
                          librosa (rule-based)
                          (prosody analysis)
                                │
                                ▼
                          {emotion: "happy"|"sad"|"angry"|"neutral",
                           confidence: 0.85}
                                │
                                ▼
                          librosa prosody extraction
                          (pitch, MFCCs, energy, spectral)
                                │
                                ▼
                          {prosody: {pitch_mean, pitch_std,
                           energy_mean, speaking_rate, mfcc_summary}}

[Frontend] receives both responses (Promise.all)
        │
        ▼
  Merge: {text, voice_emotion, prosody}
        │
        ▼
  Send merged payload via POST /api/sessions/:id/messages to [Hono Server]
        │
        ▼
  (continues as Text Conversation Flow with enriched context)
```

### 3.3 Facial Emotion Flow (Browser-Side)

```
[Frontend] - Human.js (@vladmandic/human) running in-browser
        │
        ▼
  Webcam frames ──► Human face detection (15-30 FPS)
        │
        ▼
  Emotion model (TensorFlow.js, ~10MB cached)
        │
        ▼
  7-emotion JSON scores per frame:
  {happy: 0.85, neutral: 0.12, sad: 0.01, angry: 0.01,
   fearful: 0.00, disgusted: 0.00, surprised: 0.01}
        │
        ▼
  Smoothing: rolling average over last N frames
  (reduce jitter, emit stable readings)
        │
        ▼
  [POST /api/emotions] ──fire-and-forget──► [Hono Server]
        │
        ▼
  Store in emotion_readings table (face channel)
  Inject into Claude context as supplementary signal

  *** ZERO facial images ever leave the browser ***
  *** Visual indicator shown when active ***
  *** User can opt-out at any time ***
```

### 3.4 TTS Response Flow

```
[Claude generates text response]
        │
        ▼
[Hono Server] ──HTTP POST──► [tts-service /synthesize]
                                     │
                                     ▼
                               Kokoro TTS (82M params)
                               2x real-time on CPU
                               Hindi support
                                     │
                                     ▼
                               Audio buffer (WAV/MP3)
                                     │
                                     ▼
[Hono Server] ◄── audio binary ──────┘
        │
        ▼
  Save to filesystem (Docker volume)
  Store reference in messages table
        │
        ▼
[Frontend] ◄──SSE event (audio URL)
        │
        ▼
  Play audio via Web Audio API
```

### 3.5 Session Lifecycle Flow

```
User opens app / starts new session
        │
        ▼
[Frontend] ──POST /api/sessions──► [Hono Server]
        │
        ▼
  Create new session record in DB
  (status: active, started_at: now())
        │
        ▼
  Initialize Claude CLI session:
  - Load system prompt (~2,000 tokens) with therapeutic framework
  - Retrieve user profile from DB (~3,000 tokens)
  - Retrieve session summaries (~3,000 tokens)
  - Query Mem0 for relevant memories (~12,000 tokens, 10-15 chunks)
  - Total context budget: ~120,000 tokens
        │
        ▼
  CLI session ready, awaiting user input
        │
        ▼
  ... conversation turns ...
        │
        ▼
  User ends session OR inactivity timeout
        │
        ▼
[Hono Server]
  1. Generate session summary via Claude (300-500 words)
     Themes, insights, cognitive patterns, action items
  2. Generate embedding for session summary
  3. Store summary + embedding in DB
  4. Update Mem0 with extracted facts
  5. Update session record (status: completed, ended_at: now())
  6. Check if weekly/monthly rollup needed
        │
        ▼
[Frontend] ◄──SSE event via /api/sessions/:id/events──── [Hono Server]
        │
        ▼
  Show session summary card
```

### Session End Triggers

| Trigger | Mechanism | Reliability |
|---|---|---|
| Explicit end | User clicks "End Session" → `POST /api/sessions/:id/end` | Guaranteed |
| Inactivity timeout | Server timer: 30 min no activity → auto-end | Guaranteed |
| Browser/tab close | `beforeunload` → `navigator.sendBeacon()` | Best-effort |
| Orphan cleanup | Server sweep every 5 min: stale active sessions → auto-end | Guaranteed (delayed) |

**Orphan detection query:**
```sql
UPDATE sessions
SET status = 'completed', ended_at = NOW()
WHERE status = 'active'
  AND last_activity_at < NOW() - INTERVAL '30 minutes'
RETURNING id;
```
Each returned session ID triggers the summary generation pipeline asynchronously.

**Crisis sessions** are never auto-summarized — they are preserved verbatim and flagged for review.

---

## 4. Claude CLI Architecture

### CLI Integration Layer

```
apps/server/src/sdk/
├── session-manager.ts      # Create, resume, end CLI sessions
├── message-transformer.ts  # CLI streaming → SSE events
├── skill-loader.ts         # Load .claude/skills/*.md as system context
├── hook-registry.ts        # Register PreToolUse, PostToolUse hooks
├── mcp-config.ts           # MCP server configurations
└── types.ts                # CLI-related TypeScript types
```

### Session Manager

```typescript
// Conceptual architecture (not implementation)

interface TherapySession {
  id: string;                    // UUID
  sdkSessionId: string;          // Claude CLI session ID for resume
  userId: string;                // User identifier
  status: 'active' | 'completed' | 'crisis_escalated';
  contextBudget: {
    systemPrompt: number;        // ~2,000 tokens
    userProfile: number;         // ~3,000 tokens
    sessionSummaries: number;    // ~3,000 tokens
    retrievedMemories: number;   // ~12,000 tokens
    conversationHistory: number; // ~96,000 tokens
    responseReserve: number;     // ~4,000 tokens
  };
}

// Session lifecycle:
// 1. createSession() → new CLI query with full context
// 2. sendMessage()   → stream via CLI spawn
// 3. endSession()    → generate summary, update Mem0, close session
```

### CLI Query Configuration

```typescript
// Conceptual configuration shape
{
  prompt: userMessage,
  options: {
    systemPrompt: buildTherapeuticPrompt(userProfile, memories, lastSummary),
    model: "sonnet",                    // Claude Sonnet 4
    allowedTools: [
      "mcp__postgres__query",           // DB read/write via MCP
    ],
    mcpServers: {
      postgres: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", DATABASE_URL]
      }
    },
    hooks: {
      PreToolUse: [crisisDetectionHook],
      PostToolUse: [auditLogHook, memoryExtractionHook]
    },
    resume: previousSdkSessionId,       // Cross-session continuity
  }
}
```

### Hook Architecture

```
                    User message arrives
                           │
                           ▼
                 ┌─────────────────────┐
                 │   PreToolUse Hooks  │
                 │                     │
                 │  1. Crisis detector │──── YES ──► Hard-coded crisis response
                 │     (keyword +      │              + helpline numbers
                 │      classifier)    │              + session flagged
                 │                     │
                 │  2. Input validator │──── INVALID ──► Reject with typed error
                 │     (Zod schema)    │
                 │                     │
                 └─────────┬───────────┘
                           │ PASS
                           ▼
                 ┌─────────────────────┐
                 │  Claude CLI spawn() │
                 │  (streaming)        │
                 └─────────┬───────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │  PostToolUse Hooks  │
                 │                     │
                 │  1. Emotion extract │──► Store in emotion_readings
                 │  2. Fact extraction │──► Update Mem0
                 │  3. Audit logger    │──► Log to DB
                 │  4. Mood inference  │──► Update mood_logs
                 │                     │
                 └─────────────────────┘
```

### Skills (Therapeutic Frameworks)

```
.claude/skills/
├── cbt-thought-record.md       # CBT cycle: Situation → Thought → Emotion
│                                 #   → Evidence → Balanced Thought → Outcome
├── mi-oars.md                  # Motivational Interviewing:
│                                 #   Open questions, Affirmations,
│                                 #   Reflections (2:1 ratio), Summaries
├── darn-cat.md                 # Change talk detection:
│                                 #   Desire, Ability, Reason, Need,
│                                 #   Commitment, Activation, Taking steps
├── cognitive-distortions.md    # Detection + gentle labeling:
│                                 #   All-or-nothing, catastrophizing,
│                                 #   mind reading, should-statements,
│                                 #   emotional reasoning
├── crisis-protocol.md          # Crisis detection rules, escalation paths,
│                                 #   helpline numbers, hard-coded responses
└── hinglish-conversation.md    # Hinglish tone, cultural framing,
                                  #   stigma-free language guidelines
```

---

## 5. REST + SSE Protocol

### API Surface

All client-server communication uses REST endpoints. AI streaming responses use SSE (Server-Sent Events) via Hono's `streamSSE`. Hono RPC provides end-to-end type safety automatically.

### Route Registry

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/sessions` | Create new therapy session |
| `GET` | `/api/sessions/:id` | Get session details |
| `POST` | `/api/sessions/:id/messages` | Send message, returns SSE stream (Claude streaming) |
| `POST` | `/api/sessions/:id/end` | End current session |
| `POST` | `/api/emotions` | Ingest emotion frame (fire-and-forget, facial/voice at 2-10Hz) |
| `POST` | `/api/assessments` | Submit clinical assessment (PHQ-9, GAD-7) |
| `GET` | `/api/assessments` | List assessments |
| `POST` | `/api/mood-logs` | Create mood log (circumplex model) |
| `GET` | `/api/mood-logs` | List mood logs |
| `GET` | `/api/sessions/:id/events` | SSE stream for session notifications (crisis, assessment due) |

### SSE Streaming (Claude AI Responses)

`POST /api/sessions/:id/messages` returns a streaming SSE response with the following event types:

```
event: thinking
data: {"stage": "analyzing_emotion"}

event: chunk
data: {"text": "Main ", "done": false}

event: chunk
data: {"text": "samajh sakta hoon...", "done": true}

event: response_complete
data: {"messageId": "ai-msg-99", "tokensUsed": 47}

event: audio_ready
data: {"audioUrl": "/api/audio/tts-99.wav", "duration": 3.8}
```

### Session Event SSE (Notifications)

`GET /api/sessions/:id/events` provides a persistent SSE connection for push notifications:

```
event: crisis
data: {"crisisResponse": "I hear you...", "helplines": [...], "severity": "high"}

event: assessment_due
data: {"type": "PHQ-9", "reason": "bi_weekly_schedule"}

event: emotion_detected
data: {"primary": "anxious", "secondary": "hopeful", "confidence": 0.82}
```

### Emotion Ingestion

Facial and voice emotion data is sent via `POST /api/emotions` with HTTP keep-alive. At 2-10Hz for a single user, this is efficient and avoids the complexity of WebSocket.

```json
POST /api/emotions
{
  "sessionId": "sess-abc123",
  "channel": "face",
  "dominant": "sad",
  "scores": {"happy": 0.02, "sad": 0.71, "neutral": 0.10, "...": "..."}
}
```

### Example Request-Response Cycle

```
// Client sends message with multimodal context
POST /api/sessions/sess-abc123/messages
Content-Type: application/json

{
  "text": "Aaj bahut anxious feel ho raha hai",
  "voiceEmotion": {"emotion": "sad", "confidence": 0.72},
  "prosody": {"pitch_mean": 180, "energy_mean": 0.3, "speaking_rate": 3.2},
  "facialEmotion": {"sad": 0.45, "neutral": 0.35, "anxious": 0.15}
}

// Server responds with SSE stream
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: thinking
data: {"stage": "analyzing_emotion"}

event: chunk
data: {"text": "Main ", "done": false}

event: chunk
data: {"text": "samajh sakta hoon...", "done": true}

event: response_complete
data: {"messageId": "msg-resp-001", "fullText": "Main samajh sakta hoon..."}

event: audio_ready
data: {"audioUrl": "/audio/msg-resp-001.wav"}
```

### Why REST + SSE (Not WebSocket)

| Concern | REST + SSE | WebSocket |
|---|---|---|
| **Type safety** | Hono RPC provides full end-to-end inference | Returns `Promise<unknown>` |
| **Complexity** | Standard HTTP, no connection management | Connection lifecycle, reconnection logic |
| **Caching/CDN** | Works with standard HTTP infrastructure | Requires special proxy support |
| **Emotion ingestion** | POST with keep-alive (fine at 2-10Hz single-user) | Marginal benefit at this frequency |
| **AI streaming** | SSE is purpose-built for server-to-client streaming | Overkill for unidirectional streaming |

**Note**: A dedicated WebSocket may be added later ONLY for real-time audio streaming (v2), but the main API is REST+SSE.

---

## 6. Database Architecture

### PostgreSQL 16 + pgvector

Single database, single source of truth. pgvector extension enables vector similarity search alongside relational queries.

### Schema Overview

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ user_profiles │────►│    sessions      │────►│    messages       │
│              │     │                  │     │                  │
│ id (PK)      │     │ id (PK)          │     │ id (PK)          │
│ display_name │     │ user_id (FK)     │     │ session_id (FK)  │
│ core_traits  │     │ sdk_session_id   │     │ role             │
│ patterns     │     │ status           │     │ content          │
│ goals        │     │ started_at       │     │ audio_file_path  │
│ profile_emb  │     │ ended_at         │     │ created_at       │
│ created_at   │     │ last_activity_at │     └────────┬─────────┘
│ updated_at   │     │ summary          │              │
└──────────────┘     │ summary_embedding│              │
                     │ themes           │
                     │ created_at       │
                     └──────────────────┘     ┌────────▼─────────┐
                                              │ emotion_readings │
┌──────────────────┐                          │                  │
│  mood_logs       │                          │ id (PK)          │
│                  │                          │ message_id (FK)  │
│ id (PK)          │                          │ session_id (FK)  │
│ session_id (FK)  │                          │ channel          │
│ user_id (FK)     │                          │ (text|voice|face)│
│ valence          │                          │ emotion_label    │
│ arousal          │                          │ confidence       │
│ source           │                          │ signal_weight    │
│ created_at       │                          │ raw_scores       │
│                  │                          │ prosody_data     │
└──────────────────┘                          │ created_at       │
                                              └──────────────────┘
┌──────────────────┐     ┌──────────────────┐
│  assessments     │     │   memories       │
│                  │     │                  │
│ id (PK)          │     │ id (PK)          │
│ session_id (FK)  │     │ user_id (FK)     │
│ user_id (FK)     │     │ content          │
│ type (phq9|gad7) │     │ memory_type      │
│ answers (jsonb)  │     │ importance       │
│ total_score      │     │ confidence       │
│ severity         │     │ embedding        │
│ created_at       │     │ source_session_id│
└──────────────────┘     │ source_message_id│
                         │ last_confirmed_at│
                         │ superseded_by    │
                         │ created_at       │
                         │ updated_at       │
                         └──────────────────┘

┌──────────────────────────┐
│  session_summaries       │
│                          │
│ id (PK)                  │
│ session_id (FK)          │
│ user_id (FK)             │
│ level                    │
│ (turn|session|weekly|    │
│  monthly|profile)        │
│ content                  │
│ embedding (vector)       │
│ themes (text[])          │
│ cognitive_patterns       │
│ (text[])                 │
│ action_items (text[])    │
│ period_start             │
│ period_end               │
│ created_at               │
└──────────────────────────┘
```

### Drizzle Schema (Key Tables)

```typescript
// Conceptual schema definition

// user_profiles
{
  id: uuid().primaryKey(),
  displayName: text(),
  coreTraits: jsonb(),          // Persistent personality traits
  patterns: jsonb(),            // Long-term behavioral patterns
  goals: jsonb(),               // Long-term therapeutic goals
  profileEmbedding: vector(1024), // For semantic matching
  createdAt: timestamp(),
  updatedAt: timestamp(),
}

// sessions
{
  id: uuid().primaryKey(),
  userId: uuid().references(userProfiles.id),
  sdkSessionId: text(),         // Claude CLI session ID
  status: text(),               // 'active' | 'completed' | 'crisis_escalated'
  summary: text(),              // 300-500 word session summary
  summaryEmbedding: vector(1024),
  themes: text().array(),
  startedAt: timestamp(),
  endedAt: timestamp(),
  lastActivityAt: timestamp(),  // Updated on each message; used by orphan cleanup sweep
  createdAt: timestamp(),
}

// messages
{
  id: uuid().primaryKey(),
  sessionId: uuid().references(sessions.id),
  role: text(),                 // 'user' | 'assistant'
  content: text(),              // Message text
  audioFilePath: text(),        // Path to audio file if voice
  createdAt: timestamp(),
}

// emotion_readings
// NOTE: Face and voice emotions are WEAK signals (FER accuracy ~65-72% even for humans).
// Use these to prompt follow-up questions, never to conclude emotional state.
// Highest-signal input is structured self-report + longitudinal change.
{
  id: uuid().primaryKey(),
  messageId: uuid().references(messages.id),
  sessionId: uuid().references(sessions.id),
  channel: text(),              // 'text' | 'voice' | 'face'
  emotionLabel: text(),         // Primary emotion detected
  confidence: real(),           // 0-1 confidence score
  signalWeight: real(),         // Channel reliability: text=0.8, voice=0.5, face=0.3
  rawScores: jsonb(),           // Full emotion distribution
  prosodyData: jsonb(),         // Pitch, energy, MFCCs (voice only)
  createdAt: timestamp(),
}

// mood_logs
{
  id: uuid().primaryKey(),
  sessionId: uuid().references(sessions.id),
  userId: uuid().references(userProfiles.id),
  valence: real(),              // -1 to +1 (pleasant <-> unpleasant)
  arousal: real(),              // 0 to 1 (deactivated <-> activated)
  source: text(),               // 'user_input' | 'ai_inferred' | 'assessment'
  createdAt: timestamp(),
}

// assessments
{
  id: uuid().primaryKey(),
  sessionId: uuid().references(sessions.id),
  userId: uuid().references(userProfiles.id),
  type: text(),                 // 'phq9' | 'gad7'
  answers: jsonb(),             // Array of 0-3 per question
  totalScore: integer(),        // PHQ-9: 0-27, GAD-7: 0-21
  severity: text(),             // 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe'
  createdAt: timestamp(),
}

// memories (Mem0 managed, queryable via Drizzle)
{
  id: uuid().primaryKey(),
  userId: uuid().references(userProfiles.id),
  content: text(),              // Extracted fact/memory
  memoryType: text(),           // 'profile_fact' | 'relationship' | 'goal' | 'coping_strategy' | 'recurring_trigger' | 'life_event' | 'symptom_episode' | 'unresolved_thread' | 'safety_critical' | 'win' | 'session_summary' | 'formative_experience'
  importance: real(),           // 0-1 importance score
  confidence: real(),           // 0-1 extraction confidence
  embedding: vector(1024),      // For semantic retrieval
  sourceSessionId: uuid(),      // Which session this was extracted from
  sourceMessageId: uuid(),      // Specific message that produced this memory
  lastConfirmedAt: timestamp(), // When user last reaffirmed this fact
  supersededBy: uuid(),         // Points to newer memory that contradicts this one
  createdAt: timestamp(),
  updatedAt: timestamp(),
}

// session_summaries (hierarchical memory)
{
  id: uuid().primaryKey(),
  sessionId: uuid().references(sessions.id),
  userId: uuid().references(userProfiles.id),
  level: text(),                // 'turn' | 'session' | 'weekly' | 'monthly' | 'profile'
  content: text(),
  embedding: vector(1024),
  themes: text().array(),
  cognitivePatterns: text().array(),
  actionItems: text().array(),
  periodStart: timestamp(),
  periodEnd: timestamp(),
  createdAt: timestamp(),
}
```

### Key Indexes

```sql
-- Vector similarity searches
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_session_summaries_embedding ON session_summaries USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_user_profiles_embedding ON user_profiles USING ivfflat (profile_embedding vector_cosine_ops);

-- Temporal queries
CREATE INDEX idx_sessions_user_started ON sessions (user_id, started_at DESC);
CREATE INDEX idx_messages_session_created ON messages (session_id, created_at);
CREATE INDEX idx_emotion_readings_session ON emotion_readings (session_id, created_at);
CREATE INDEX idx_mood_logs_user_created ON mood_logs (user_id, created_at DESC);
CREATE INDEX idx_assessments_user_type ON assessments (user_id, type, created_at DESC);

-- Combined temporal + vector (the killer query pattern)
CREATE INDEX idx_memories_user_created ON memories (user_id, created_at DESC);
-- Then: WHERE user_id = $1 AND created_at >= interval ORDER BY embedding <=> query LIMIT 5
```

### Temporal + Vector Query Pattern

```sql
-- "What was I feeling last month?" type queries
SELECT content, themes, created_at
FROM session_summaries
WHERE user_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY embedding <=> $2  -- cosine similarity to query embedding
LIMIT 5;
```

---

## 7. Memory Architecture

### Overview

Three-layer memory system: **Mem0** (automatic fact extraction), **Hierarchical Summaries** (temporal compression), and **pgvector** (unified storage).

```
┌────────────────────────────────────────────────────────────────┐
│                     MEMORY ARCHITECTURE                        │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Layer 1: Per-Turn Extraction                            │  │
│  │  PostToolUse hook after each Claude response             │  │
│  │  → Extract emotional state                               │  │
│  │  → Extract key facts → Mem0                              │  │
│  │  → Store emotion_reading in DB                           │  │
│  └──────────────────────────────┬───────────────────────────┘  │
│                                 │                              │
│  ┌──────────────────────────────▼───────────────────────────┐  │
│  │  Layer 2: Session Summary (on session end)               │  │
│  │  Claude generates 300-500 word summary:                  │  │
│  │  → Themes, insights, cognitive patterns, action items    │  │
│  │  → Embed with BAAI/bge-m3                               │  │
│  │  → Store in session_summaries (level: 'session')         │  │
│  └──────────────────────────────┬───────────────────────────┘  │
│                                 │                              │
│  ┌──────────────────────────────▼───────────────────────────┐  │
│  │  Layer 3: Weekly Rollup (every 7 days)                   │  │
│  │  Aggregate session summaries from past week:             │  │
│  │  → Patterns across sessions                              │  │
│  │  → Progress on goals                                     │  │
│  │  → Store in session_summaries (level: 'weekly')          │  │
│  └──────────────────────────────┬───────────────────────────┘  │
│                                 │                              │
│  ┌──────────────────────────────▼───────────────────────────┐  │
│  │  Layer 4: Monthly Synthesis (every 30 days)              │  │
│  │  Aggregate weekly rollups:                               │  │
│  │  → Long-term patterns, growth areas, recurring concerns  │  │
│  │  → Store in session_summaries (level: 'monthly')         │  │
│  └──────────────────────────────┬───────────────────────────┘  │
│                                 │                              │
│  ┌──────────────────────────────▼───────────────────────────┐  │
│  │  Layer 5: User Profile (~3K tokens, always in context)   │  │
│  │  Core traits, persistent patterns, long-term goals       │  │
│  │  Updated after each monthly synthesis                    │  │
│  │  → Store in user_profiles table                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Mem0 Integration                                        │  │
│  │  Backend: pgvector (same PostgreSQL instance)            │  │
│  │  → Automatic fact extraction from conversations          │  │
│  │  → Stores across vector + key-value stores               │  │
│  │  → Retrieves by relevance, importance, recency           │  │
│  │  → 26% higher accuracy than OpenAI memory                │  │
│  │  → 90% token savings vs full-context                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Context Assembly (per new session)                      │  │
│  │  Total budget: ~120,000 tokens                           │  │
│  │                                                          │  │
│  │  System prompt (therapeutic framework)    ~2,000 tokens  │  │
│  │  User profile / core memory              ~3,000 tokens  │  │
│  │  Session summaries (recent 3-5)          ~3,000 tokens  │  │
│  │  Retrieved relevant memories (10-15)     ~12,000 tokens │  │
│  │  Current conversation history            ~96,000 tokens │  │
│  │  Response reserve                        ~4,000 tokens  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Memory Retrieval for New Sessions

```
New session starts
        │
        ▼
  1. Load user profile (always, ~3,000 tokens)
        │
        ▼
  2. Load recent session summaries (~3,000 tokens)
        │
        ▼
  3. Query Mem0 with session context:
     - "What do I know about this user?"
     - Score by relevance × importance × recency
     - Select top 10-15 memories (~12,000 tokens)
        │
        ▼
  4. Assemble into system prompt
        │
        ▼
  Context ready for Claude CLI query
```

### User Journey Timeline

Beyond retrieval, the memory system supports longitudinal queries like "what has changed over the last 3 months?" and "when did this pattern start?"

**Timeline entries** are derived from stored memories and assessments:

| Entry Type | Source | Example |
|---|---|---|
| Symptom episode | `memories` (type: `symptom_episode`) | "Insomnia period: Feb 1-15, 2026" |
| Life event | `memories` (type: `life_event`) | "Breakup: Jan 2026" |
| Assessment trend | `assessments` (PHQ-9/GAD-7 over time) | "PHQ-9: 18→14→11 over 6 weeks" |
| Turning point | `memories` (type: `win` or `life_event`) | "First successful CBT reframe: Feb 20" |
| Active problem | `memories` (type: `unresolved_thread`) | "Childhood bullying — raised but not explored" |
| Goal progress | `memories` (type: `goal`) + session evidence | "Work anxiety: improving (3 sessions of progress)" |

**Timeline query pattern:**
```sql
SELECT content, memory_type, confidence, created_at, last_confirmed_at
FROM memories
WHERE user_id = $1
  AND memory_type IN ('life_event', 'symptom_episode', 'win', 'goal')
  AND created_at >= NOW() - INTERVAL '90 days'
ORDER BY created_at DESC;
```

This enables the AI to construct a narrative of the user's journey, not just retrieve isolated memories.

### Memory Provenance & Contradiction Handling

Every memory has provenance (source_session_id, source_message_id) and confidence tracking:

- **Confirmation**: If a user reaffirms a fact in a later session, `last_confirmed_at` is updated and `confidence` increases
- **Contradiction**: If new evidence contradicts an existing memory, the old memory's `superseded_by` field is set to the new memory's ID. The old memory is NOT deleted — it becomes part of the historical record
- **Decay**: Memories that haven't been confirmed in 90+ days have their effective importance reduced at retrieval time (not in storage)
- **Safety-critical memories are NEVER decayed or superseded** — they persist permanently

---

## 8. AI Pipeline Architecture

### Model Deployment Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI MODEL DEPLOYMENT                           │
│                                                                 │
│  BROWSER (client-side)                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Human.js (@vladmandic/human)                             │  │
│  │  TensorFlow.js runtime                                   │  │
│  │  Built-in face detection + emotion model                 │  │
│  │  ~10MB cached, 15-30 FPS                                 │  │
│  │  7 emotions: happy, sad, angry, fearful,                 │  │
│  │              disgusted, surprised, neutral                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  HONO SERVER (Node.js)                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Claude CLI                                        │  │
│  │  → Claude Sonnet 4 (primary conversation)                │  │
│  │  → Claude Haiku (lightweight classification)             │  │
│  │  → Prompt caching: 1hr cache, min 1024 tokens            │  │
│  │                                                          │  │
│  │  Mem0 (Python microservice)                               │  │
│  │  → Memory extraction and retrieval                       │  │
│  │  → pgvector backend                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  PYTHON MICROSERVICES (Docker)                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │ whisper-service  │ │ emotion-service │ │ tts-service     │  │
│  │                  │ │                 │ │                 │  │
│  │ faster-whisper   │ │ librosa        │ │ Kokoro TTS      │  │
│  │ (base model)    │ │ (rule-based    │ │ 82M params      │  │
│  │ CTranslate2     │ │  prosody       │ │                 │  │
│  │ INT8 quant      │ │  analysis)     │ │ POST            │  │
│  │                  │ │                 │ │ /synthesize     │  │
│  │ POST             │ │ librosa        │ │                 │  │
│  │ /transcribe      │ │ (prosody)      │ │ Input: text,    │  │
│  │                  │ │                 │ │        lang     │  │
│  │ Input: audio     │ │ POST           │ │ Output: audio   │  │
│  │ Output: text,    │ │ /analyze       │ │         buffer  │  │
│  │  lang, timestamps│ │                 │ │                 │  │
│  │                  │ │ Input: audio    │ └─────────────────┘  │
│  │                  │ │ Output:emotion, │                      │
│  │                  │ │  confidence,    │                      │
│  │                  │ │  prosody scores │                      │
│  └─────────────────┘ └─────────────────┘                      │
│                                                                 │
│  HINGLISH NLP (loaded in emotion-service or standalone)        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HingRoBERTa (l3cube-pune/hing-roberta)                  │  │
│  │  → Text emotion/sentiment classification                 │  │
│  │                                                          │  │
│  │  MuRIL (google/muril-base-cased)                         │  │
│  │  → Romanized Hindi embeddings                            │  │
│  │                                                          │  │
│  │  BAAI/bge-m3                                             │  │
│  │  → General embeddings (100+ languages)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Embedding Pipeline

```
Text input (Hinglish)
        │
        ▼
  BAAI/bge-m3 (self-hosted)
  Dense + sparse + multi-vector
  1024-dimensional output
        │
        ▼
  Store in pgvector column
  (memories.embedding, session_summaries.embedding, etc.)
        │
        ▼
  Queryable via cosine similarity:
  ORDER BY embedding <=> query_embedding
```

---

## 9. Crisis Detection Pipeline

**This is MANDATORY and non-negotiable.** Every user message must pass through crisis detection before any other processing.

```
                    User message arrives
                           │
                           ▼
              ┌────────────────────────────┐
              │   STAGE 1: Keyword Match   │
              │   (deterministic, instant)  │
              │                            │
              │   Hard-coded keyword list:  │
              │   - suicide/suicidal        │
              │   - kill myself             │
              │   - want to die             │
              │   - self-harm / cut myself  │
              │   - end my life             │
              │   - Hinglish equivalents:   │
              │     - marna chahta/chahti   │
              │     - zindagi khatam        │
              │     - khudkushi             │
              │                            │
              └─────────────┬──────────────┘
                            │
                     ┌──────┴──────┐
                     │  MATCHED?   │
                     └──────┬──────┘
                       YES  │  NO
                       │    │   │
                       ▼    │   ▼
              ┌─────────┐  │  ┌────────────────────────────┐
              │ CRISIS!  │  │  │  STAGE 2: Claude Haiku     │
              │ ESCALATE │  │  │  Classification             │
              └─────────┘  │  │  (lightweight, fast)         │
                       │   │  │                              │
                       │   │  │  Classify message as:        │
                       │   │  │  - safe                      │
                       │   │  │  - concerning                │
                       │   │  │  - crisis                    │
                       │   │  └──────────────┬───────────────┘
                       │   │                 │
                       │   │          ┌──────┴──────┐
                       │   │          │  CRISIS?    │
                       │   │          └──────┬──────┘
                       │   │          YES    │    NO
                       │   │           │     │     │
                       ▼   │           ▼     │     ▼
              ┌────────────────────────┐│  ┌──────────────────┐
              │  CRISIS RESPONSE       ││  │  CONTINUE NORMAL │
              │                        ││  │  CONVERSATION    │
              │  1. Immediately stop   ││  │  FLOW            │
              │     AI conversation    ││  └──────────────────┘
              │                        ││
              │  2. Surface resources:  ││
              │     - 988 Suicide &    ││
              │       Crisis Lifeline  ││
              │     - iCall India:     ││
              │       9152987821       ││
              │     - Vandrevala:      ││
              │       1860-2662-345    ││
              │                        ││
              │  3. Flag session as    ││
              │     crisis_escalated   ││
              │                        ││
              │  4. Log to DB for      ││
              │     safety audit       ││
              └────────────────────────┘│
                                        │
                                        ▼
                                 (normal flow)
```

### Critical Rules

- Crisis detection is a **PreToolUse hook** - runs before Claude generates ANY response
- Keyword matching is **deterministic** - no AI judgment for obvious crisis signals
- Claude Haiku classification is the **second layer** for subtler signals
- Crisis response is **hard-coded** - not generated by AI
- The app **NEVER claims to be a therapist** - always "wellness companion" / "journaling assistant"
- Session is flagged `crisis_escalated` and logged for safety audit

---

## 10. Error Handling

### Result Pattern (Typed Error Codes)

Every service boundary returns a typed `Result` - no thrown exceptions crossing service boundaries.

```typescript
// Shared error code enum (packages/shared/src/constants/errors.ts)
enum ErrorCode {
  // General
  INTERNAL_ERROR = "INTERNAL_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",

  // Session
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_ALREADY_ACTIVE = "SESSION_ALREADY_ACTIVE",
  SESSION_ENDED = "SESSION_ENDED",

  // AI
  SDK_CONNECTION_FAILED = "SDK_CONNECTION_FAILED",
  SDK_SESSION_ERROR = "SDK_SESSION_ERROR",
  MODEL_TIMEOUT = "MODEL_TIMEOUT",
  CONTEXT_BUDGET_EXCEEDED = "CONTEXT_BUDGET_EXCEEDED",

  // Microservices
  WHISPER_UNAVAILABLE = "WHISPER_UNAVAILABLE",
  WHISPER_TRANSCRIPTION_FAILED = "WHISPER_TRANSCRIPTION_FAILED",
  EMOTION_SERVICE_UNAVAILABLE = "EMOTION_SERVICE_UNAVAILABLE",
  EMOTION_ANALYSIS_FAILED = "EMOTION_ANALYSIS_FAILED",
  TTS_UNAVAILABLE = "TTS_UNAVAILABLE",
  TTS_SYNTHESIS_FAILED = "TTS_SYNTHESIS_FAILED",

  // Database
  DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED",
  DB_QUERY_FAILED = "DB_QUERY_FAILED",
  MEMORY_RETRIEVAL_FAILED = "MEMORY_RETRIEVAL_FAILED",

  // Crisis
  CRISIS_DETECTED = "CRISIS_DETECTED",  // Not really an "error" but uses same flow
}

// Result type
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string; details?: unknown } };
```

### Error Flow

```
Service call fails
        │
        ▼
  Return Result<T> with success: false
  (never throw across service boundaries)
        │
        ▼
  Calling code pattern-matches on error.code
        │
        ├── Recoverable? → Retry or degrade gracefully
        │
        └── Fatal? → Log to DB + notify frontend via SSE error event on /api/sessions/:id/events
                     event: error, data: {code, message}
```

### Python Microservice Error Format

```json
// HTTP 200 with Result pattern (not HTTP error codes for business logic)
{"success": false, "error": {"code": "WHISPER_TRANSCRIPTION_FAILED", "message": "Audio too short (<0.5s)", "details": {"duration": 0.3}}}

// HTTP 5xx only for actual infrastructure failures
```

---

## 11. File Storage

### Local Filesystem (Docker Volume)

```
volumes/
├── audio/
│   ├── recordings/          # User voice recordings
│   │   └── {session_id}/
│   │       └── {message_id}.webm
│   └── tts/                 # AI voice responses
│       └── {session_id}/
│           └── {message_id}.wav
└── models/                  # Cached AI models
    ├── whisper/             # faster-whisper base
    ├── librosa/             # librosa prosody models
    ├── kokoro/              # Kokoro TTS 82M
    ├── hingroberta/         # HingRoBERTa
    ├── muril/               # MuRIL
    └── bge-m3/              # BAAI/bge-m3 embeddings
```

### Docker Volume Mount

```yaml
volumes:
  audio-data:
    driver: local
  model-cache:
    driver: local

services:
  server:
    volumes:
      - audio-data:/app/volumes/audio
  whisper:
    volumes:
      - audio-data:/app/volumes/audio:ro   # Read-only access to recordings
      - model-cache:/app/models
  emotion:
    volumes:
      - audio-data:/app/volumes/audio:ro
      - model-cache:/app/models
  tts:
    volumes:
      - audio-data:/app/volumes/audio
      - model-cache:/app/models
```

### File Naming Convention

```
recordings:  {session_id}/{message_id}.webm
tts output:  {session_id}/{message_id}.wav
```

Database `messages.audio_file_path` stores relative path from `volumes/audio/`.

---

## 12. Security Architecture

### v1 Scope (Personal, Single-User, Local)

Since v1 is personal use running locally via Docker Compose:

| Concern | Approach |
|---|---|
| **Auth** | None (single user) |
| **Network** | All services on internal Docker network, only web + server exposed to localhost |
| **Facial data** | Never leaves browser - Human.js processes locally, sends JSON scores only |
| **Audio data** | Stored in local Docker volume, never transmitted externally |
| **API keys** | Claude uses local binary auth (existing Claude Code login) |
| **Database** | Local PostgreSQL, no external access |
| **Crisis data** | Logged locally for self-review |

### Data Privacy Guarantees

1. **Zero facial images** transmitted to any server - Human.js runs in-browser
2. **Audio stays local** - stored in Docker volume, processed by local microservices
3. **No external API calls** for sensitive data - Claude runs via local binary
4. **Single PostgreSQL instance** - all data in one place, easy to audit/delete
5. **Mem0 backend is pgvector** (same DB) - no external memory service calls

### Framing & Liability

- App NEVER claims to be a therapist
- Framed as "wellness companion" / "journaling assistant"
- Crisis resources always available
- Clear disclaimer in UI

---

## 13. Electron Migration Path

When ready to package as a desktop app:

### What Changes

| Component | Web App (v1) | Electron (future) |
|---|---|---|
| **React frontend** | Browser at localhost:5173 | Electron renderer (BrowserWindow) |
| **Hono server** | Node.js process at localhost:3000 | Electron main process |
| **REST + SSE** | HTTP over network | Electron IPC bridge (or local HTTP) |
| **Claude CLI** | Server spawns local binary | Main process has direct binary access |
| **Docker services** | Docker Compose | Can keep Docker OR bundle Python with app |
| **File storage** | Docker volume | App data directory (`userData`) |
| **Database** | Docker PostgreSQL | Embedded SQLite (switch) OR keep Docker PG |

### What Stays The Same

- React component tree (entire UI)
- Zustand stores
- REST + SSE protocol (Hono RPC types)
- All shared types and validators
- Human.js in-browser processing
- Python microservice APIs (if kept in Docker)
- Claude CLI integration code
- Drizzle schema definitions (if staying on PG)

### Migration Steps

1. Add Electron shell (`electron-builder` or `electron-forge`)
2. Move Hono server into Electron main process
3. Replace REST + SSE with Electron IPC (or keep local HTTP)
4. Update Claude CLI binary resolution
5. Configure auto-updater
6. Package Python services (or keep Docker requirement)

---

## Appendix A: Service API Contracts

### whisper-service (port 8001)

```
POST /transcribe
Content-Type: multipart/form-data

Body: audio file (webm/wav/mp3)

Response:
{
  "success": true,
  "data": {
    "text": "Aaj bahut anxious feel ho raha hai",
    "language": "hi",
    "segments": [
      {"start": 0.0, "end": 2.5, "text": "Aaj bahut anxious"},
      {"start": 2.5, "end": 4.1, "text": "feel ho raha hai"}
    ],
    "duration": 4.1
  }
}

GET /health
Response: {"status": "ok", "model": "base"}
```

### emotion-service (port 8002)

```
POST /analyze
Content-Type: multipart/form-data

Body: audio file (webm/wav/mp3)

Response:
{
  "success": true,
  "data": {
    "emotion": {
      "label": "sad",
      "confidence": 0.72,
      "scores": {
        "happy": 0.08,
        "sad": 0.72,
        "angry": 0.05,
        "neutral": 0.15
      }
    },
    "prosody": {
      "pitch_mean": 180.5,
      "pitch_std": 22.3,
      "energy_mean": 0.31,
      "energy_std": 0.08,
      "speaking_rate": 3.2,
      "mfcc_summary": [/* 13 coefficients */]
    }
  }
}

GET /health
Response: {"status": "ok", "models": ["librosa"]}
```

### tts-service (port 8003)

```
POST /synthesize
Content-Type: application/json

Body:
{
  "text": "Main samajh sakta hoon ki aap anxious feel kar rahe hain",
  "language": "hi",
  "speed": 1.0
}

Response:
Content-Type: audio/wav
Body: audio binary

GET /health
Response: {"status": "ok", "model": "kokoro-82m", "languages": ["en", "hi"]}
```

---

## Appendix B: Environment Variables

```bash
# Database
DATABASE_URL=postgresql://moc:password@db:5432/moc

# Service URLs (internal Docker network)
WHISPER_SERVICE_URL=http://whisper:8001
EMOTION_SERVICE_URL=http://emotion:8002
TTS_SERVICE_URL=http://tts:8003
MEMORY_SERVICE_URL=http://memory:8004
VOICE_SERVICE_URL=http://voice:8005

# Claude (uses local binary auth, no API key needed)
CLAUDE_MODEL=sonnet
CLAUDE_HAIKU_MODEL=haiku

# Mem0
MEM0_BACKEND=pgvector
MEM0_DATABASE_URL=postgresql://moc:password@db:5432/moc

# Embedding
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSION=1024

# Server
PORT=3000
WS_PORT=3000
NODE_ENV=development

# File storage
AUDIO_STORAGE_PATH=/app/volumes/audio
MODEL_CACHE_PATH=/app/models
```

---

## Appendix C: Docker Compose Structure

```yaml
version: "3.9"

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "5173:5173"
    depends_on:
      - server
    networks:
      - moc-net

  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://moc:password@db:5432/moc
      - WHISPER_SERVICE_URL=http://whisper:8001
      - EMOTION_SERVICE_URL=http://emotion:8002
      - TTS_SERVICE_URL=http://tts:8003
      - MEMORY_SERVICE_URL=http://memory:8004
      - VOICE_SERVICE_URL=http://voice:8005
    volumes:
      - audio-data:/app/volumes/audio
      - ~/.claude:/root/.claude:ro          # Claude binary + auth
    depends_on:
      db:
        condition: service_healthy
    networks:
      - moc-net

  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: moc
      POSTGRES_PASSWORD: password
      POSTGRES_DB: moc
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U moc"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - moc-net

  whisper:
    build:
      context: services/whisper
    ports:
      - "8001:8001"
    volumes:
      - audio-data:/app/volumes/audio:ro
      - model-cache:/app/models
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]    # GPU if available
    networks:
      - moc-net

  emotion:
    build:
      context: services/emotion
    ports:
      - "8002:8002"
    volumes:
      - audio-data:/app/volumes/audio:ro
      - model-cache:/app/models
    networks:
      - moc-net

  tts:
    build:
      context: services/tts
    ports:
      - "8003:8003"
    volumes:
      - audio-data:/app/volumes/audio
      - model-cache:/app/models
    networks:
      - moc-net

  memory:
    build:
      context: services/memory
    ports:
      - "8004:8004"
    environment:
      - DATABASE_URL=postgresql://moc:password@db:5432/moc
    depends_on:
      db:
        condition: service_healthy
    networks:
      - moc-net

  voice:
    build:
      context: services/voice
    ports:
      - "8005:8005"
    networks:
      - moc-net

volumes:
  pgdata:
  audio-data:
  model-cache:

networks:
  moc-net:
    driver: bridge
```
