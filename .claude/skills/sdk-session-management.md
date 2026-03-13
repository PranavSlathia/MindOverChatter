---
name: sdk-session-management
description: Claude Agent SDK session lifecycle management for therapeutic conversations including context assembly, hooks, and streaming
user-invocable: false
---

# Claude Agent SDK Session Management

## Purpose

Claude Agent SDK session lifecycle management for MindOverChatter's therapeutic conversations. Each therapy session maps to an SDK conversation with structured context assembly, hook-based safety monitoring, and streaming delivery over SSE.

## Session Lifecycle

### 1. Create / Resume → `runOnStart`

`POST /api/sessions` (create) and `POST /api/sessions/:id/resume` both call `runOnStart({ userId, sdkSessionId })` after the SDK session is initialised. This runs two sequential hooks:

**`memory-blocks-injection`** — loads all 6 named memory blocks from the `memory_blocks` table and injects them as a delimited block into the Claude context:
- `user/overview`, `user/goals`, `user/triggers`, `user/coping_strategies`, `user/relationships` (500 chars each)
- `companion/therapeutic_calibration` (800 chars) — self-updating communication style notes

**`therapy-plan-injection`** — loads the latest `therapy_plans` row, formats it as an internal clinical block (mode instructions + directive authority + unexplored areas + natural callbacks), and injects it. Also calls `setSessionMode()` to initialise the in-memory mode tracker from `recommended_session_mode`.

**Context budget (~120,000 tokens total):**

| Component | Approx Tokens | Source |
|---|---|---|
| System prompt | ~2,000 | Static therapeutic persona + rules |
| Named memory blocks (6) | ~1,500 | `memory_blocks` table — persistent across sessions |
| Therapy plan (internal) | ~2,000 | `therapy_plans` table — injected as clinical notes |
| Session summaries (recent 3-5) | ~3,000 | Compressed summaries from previous sessions |
| Mem0 memories | ~12,000 | Semantic search retrieval (10-15 chunks) |
| Conversation history | ~96,000 | Messages from current session |
| Response reserve | ~4,000 | Reserved for Claude's response generation |

### 2. Query (Streaming) + Mid-Session Mode Shifts

Each message goes through:
1. **Crisis detection** (deterministic keyword match → Haiku classifier)
2. **Mode shift detection** — `detectModeShift(text, currentMode, directiveAuthority)` — pure regex, no LLM, runs on every message
3. If mode shift detected: `injectSessionContext(sdkSessionId, formatModeShiftBlock(newMode))` + `setSessionMode(sdkSessionId, newMode)`
4. `streamAiResponse()` — SDK streaming, events forwarded as SSE

**5 session modes:**

| Mode | When | Behavioural instruction |
|------|------|------------------------|
| `follow_support` | Distress / overwhelm | Follow, reflect, don't redirect. Presence is the intervention. |
| `assess_map` | Stable, picture incomplete | Open curious questions. Map situation and impact. |
| `deepen_history` | Engaged, ready | Explore roots and earlier experiences at user's pace. |
| `challenge_pattern` | Insight readiness signals | Gentle reframes via "I wonder…" / "What if…" — invite, never lecture. |
| `consolidate_close` | Goals largely established | Name progress, close open threads, orient toward what's next. |

`follow_support` always overrides `challenge_pattern`. Once in `follow_support`, session won't shift to `challenge_pattern` until mode resets. `directive_authority: "low"` in the therapy plan clamps challenge-type shifts regardless of message content.

### 3. End → `runOnEnd`

`POST /api/sessions/:id/end` emits `session.ending` SSE event, then calls `runOnEnd(ctx)`, then emits `session.ended`. The SSE ordering ensures the UI shows the closing state only after all critical work is done.

**onEnd hook execution order:**

| Hook | Priority | Behaviour |
|------|----------|-----------|
| `session-summary` | **critical** | Awaited before `runOnEnd` returns. Claude call → structured JSON → `session_summaries` table. User waits (~5-15s). |
| `formulation` | background | Fire-and-forget after critical hooks. Regenerates wellbeing formulation from all evidence. |
| `therapy-plan` | background | Runs after formulation. `pg_advisory_xact_lock` prevents races. New version appended (never overwritten). |
| `therapeutic-calibration` | background | Only fires if session had ≥4 turns. Rewrites `companion/therapeutic_calibration` memory block. Safety-gated before persistence. |

**assertHookContract** runs at server startup (`index.ts`) and throws synchronously if any required hook is missing or has wrong priority. A misconfigured hook registry is caught before the first request, not at runtime.

## Calibration Safety

Two-layer prompt injection defence in `hooks/calibration-safety.ts`:
- `sanitizeForPrompt(text)` — strips `---BEGIN/---END` delimiters and `===` headers from both the existing calibration notes and session transcript before interpolation
- `isSafeCalibration(text)` — blocklist of 20 targeted regex patterns (safety bypass directives, therapist identity claims, clinical diagnostic terms, crisis-adjacent content). Unsafe output is silently discarded; previous block value is preserved.

## MCP Configuration

The SDK session is configured with an MCP server that gives Claude controlled access to the database.

```ts
const mcpConfig = {
  servers: [
    {
      name: "postgres",
      type: "postgresql",
      connectionString: process.env.DATABASE_URL,
      allowedOperations: ["read", "write"],
      allowedTables: ["sessions", "messages", "memories", "user_profiles"],
    },
  ],
};
```

This allows Claude to read user history and write new memories/messages directly, reducing round-trips through application code.

## Resume Pattern

For cross-session continuity, the SDK supports resuming a previous conversation:

```ts
const conversation = await sdk.createConversation({
  resume: previousSdkSessionId,
  // Context is rebuilt from the previous session's state
});
```

The `resume` field takes the SDK session ID from the previous conversation. The SDK restores the conversation state, and the server supplements it with the freshly assembled context (new memories, updated profile, etc.).

## Message Transformation

SDK streaming events are transformed into SSE events delivered over the `GET /api/sessions/:id/events` SSE connection:

| SDK Event | SSE Event Type | Data Payload |
|---|---|---|
| `text_delta` | `ai.chunk` | `{ delta: string }` |
| `thinking_delta` | `ai.thinking` | `{ delta: string }` |
| `result` | `ai.response_complete` | `{ message: string, sessionId: string }` |
| `tool_use` | `ai.tool_use` | `{ tool: string, input: object }` |
| `error` | `ai.error` | `{ code: number, message: string }` |

Each SSE event uses the `event:` field for the event type and `data:` for the JSON payload.

## Skill Loading

Skill files from `.claude/skills/*.md` are injected into the SDK session's system context at conversation creation time. This provides Claude with domain-specific knowledge about the codebase, therapeutic frameworks, and safety protocols without hardcoding them into the application.

```ts
const skills = await loadSkillFiles(".claude/skills/");
const systemPrompt = [basePrompt, ...skills.map(s => s.content)].join("\n\n");
```
