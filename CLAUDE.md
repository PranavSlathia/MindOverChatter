# MindOverChatter

AI-powered mental wellness companion. Single-user personal app, no auth.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + Vite 6 + shadcn/ui + Zustand + Tailwind v4 |
| Backend | Hono 4.x + Drizzle ORM (TypeScript) |
| AI | Claude Agent SDK + Claude Sonnet 4 |
| Database | PostgreSQL 16 + pgvector |
| Real-time | SSE via Hono `streamSSE` (NOT WebSocket) |
| Facial emotion | Human.js in-browser (NOT face-api.js) |
| Memory | Mem0 Python microservice + pgvector backend |
| Python services | FastAPI + uv (whisper:8001, emotion:8002, tts:8003, memory:8004) |
| Container | Docker Compose (7 services) |

## Commands

```bash
pnpm turbo build          # Build all packages
pnpm turbo lint           # Lint all packages
pnpm turbo test           # Run all tests
pnpm dev                  # Start dev servers
pnpm db:generate          # Generate Drizzle migration
pnpm db:migrate           # Apply migrations
pnpm db:studio            # Open Drizzle Studio
docker compose up -d      # Start all Docker services
```

## Schema Tables

`user_profiles`, `sessions`, `messages`, `emotion_readings`, `mood_logs`, `assessments`, `memories`, `session_summaries`, `user_formulations`, `therapy_plans`, `memory_blocks`

## Key Architecture Decisions

- **REST + SSE** for all communication (NOT WebSocket)
- **Hono RPC** for end-to-end type safety (no codegen)
- **Context budget**: ~120,000 tokens per session
- **Language**: Adapt to user input (mostly English)
- **Therapeutic approach**: Open-ended with blended CBT + MI-OARS + Person-Centred + IPT/Schema-informed probing
- **Emotion signals are WEAK**: Face=0.3, Voice=0.5, Text=0.8 weight. Prompt follow-ups, never conclude state.
- **Structured memory types**: profile_fact, relationship, goal, coping_strategy, recurring_trigger, life_event, symptom_episode, unresolved_thread, safety_critical, win, formative_experience
- **Memory provenance**: Every memory has source_session_id, source_message_id, confidence, last_confirmed_at, superseded_by
- **Session lifecycle hooks**: `registerOnStart/registerOnEnd` registry in `sdk/session-lifecycle.ts`. `assertHookContract()` runs at server startup and throws if any required hook is missing or has wrong priority. No SOP can be silently skipped.
- **5-mode session system**: `follow_support | assess_map | deepen_history | challenge_pattern | consolidate_close`. Initialised from therapy plan at session start. Shifts mid-session via rule-based `detectModeShift()` (regex, no LLM). `follow_support` always beats `challenge_pattern`. Mode instructions injected into Claude context on shift.
- **Named memory blocks**: 7 persistent text fields in `memory_blocks` table (`user/overview`, `user/goals`, `user/triggers`, `user/coping_strategies`, `user/relationships`, `user/origin_story`, `companion/therapeutic_calibration`). Injected at session start, rewritten at session end.
- **Therapeutic calibration**: Background hook after sessions with ≥4 turns. Claude rewrites `companion/therapeutic_calibration` block. Two-layer defence: `sanitizeForPrompt()` strips delimiters from inputs; `isSafeCalibration()` blocklist rejects unsafe output before persistence.
- **Internal therapy plan**: Generated after every session end and every assessment. Versioned with `pg_advisory_xact_lock` + `UNIQUE(user_id, version)`. Never shown to user. Injected into system prompt at next session start via `therapy-plan-injection` onStart hook.
- **onEnd hook order**: `session-summary` (critical, user waits) → `formulation` (background) → `therapy-plan` (background) → `therapeutic-calibration` (background) → `user-memory-blocks` (background)
- **Session Supervisor**: `services/session-supervisor.ts` — fires in the message handler IIFE before `streamAiResponse()`. Validates session state, enforces mode constraints, and gates messages that would violate therapeutic safety invariants.
- **Response Validator**: `services/response-validator.ts` — fires fire-and-forget inside `streamAiResponse()` after streaming completes. Scores the AI response against active directives and logs compliance metrics.
- **Skill files** (`/.claude/skills/*.md`): loaded into every session prompt. Therapeutic skills: `probing-general` (MI/Person-Centred, general exploration + life-domain coverage), `probing-longitudinal` (IPT/Schema, pattern recognition + cross-session continuity, gated ≥3 turns rapport), `probing-development` (Bowlby attachment + Young schema + Bowen family systems, childhood probing, gated ≥2nd session), `probing-{depression,anxiety,grief,panic,relationship}` (presentation-specific), `therapeutic-direction` (Operator-editable session steering), `therapeutic-safety` (crisis + framing rules), `assessment-flow` (PHQ-9/GAD-7)

## Therapeutic Safety (NON-NEGOTIABLE)

1. Crisis detection on EVERY message before AI responds
2. Crisis response is HARD-CODED (never AI-generated)
3. App NEVER claims to be a therapist — "wellness companion" only
4. Helpline numbers: 988, iCall (9152987821), Vandrevala (1860-2662-345)
5. Any crisis change → Vigil exhaustive testing MANDATORY
6. Structured symptom formulations are internal-only, NEVER surfaced as diagnoses

## File Protection

- `.env`, `.env.local`, `.env.production` — BLOCKED from automated edit
- `node_modules/` — BLOCKED
- `apps/server/drizzle/*.sql` — BLOCKED (use `pnpm db:generate`)

## Type Chain (Sacred)

Drizzle schema → Zod validators → Hono routes → Hono RPC client. Break the chain, break the types.

## Agent Team

Three-tier system: Plan → Build → Gate → Validate → Ship

| Agent | Tier | Role |
|-------|------|------|
| Compass | T1 | Sprint architecture, research (no code) |
| Sentinel | T1 | Code review, safety audit (no code) |
| Pixel | T2 | React, shadcn/ui, Human.js, Zustand |
| Forge | T2 | Hono, Drizzle, PostgreSQL, REST+SSE |
| Neura | T2 | Claude SDK, therapeutic skills, Python services |
| Vigil | T3 | QA, testing, therapeutic safety validation |

Mandatory pairings: Forge+Pixel (schema changes), Neura+Vigil (therapeutic changes), all code+Sentinel (review).

## Detailed References

- Agent team details: @.claude/soul.md
- Build phases: @BUILD_ORDER.md
- Dev procedures: @.claude/DEVELOPMENT_SOP.md
