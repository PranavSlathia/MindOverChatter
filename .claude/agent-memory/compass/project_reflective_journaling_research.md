---
name: Reflective Journaling Feature Research
description: Full codebase research for the "Questions Worth Exploring" → reflective journaling feature. Where questions come from, how they're stored, and all integration points.
type: project
---

## Fact: questionsWorthExploring originates from two sources

1. Claude-generated (full pipeline): `generateAndPersistFormulation()` in `formulation-service.ts` calls Claude via `spawnClaudeStreaming` and asks it to produce `questionsWorthExploring: [{ question, rationale, linkedTo }]` in its JSON output.
2. Algorithmic fallback: if Claude fails, `actionRecommendations.slice(0, 4).map(a => ({ question: a.conversationHint, rationale: a.evidenceSummary, linkedTo: a.domain }))`.

Questions are stored in the `user_formulations.snapshot` JSONB column — NOT their own table. They are ephemeral: each time a new formulation row is persisted, a fresh set of questions is generated.

**Why:** The questions are a byproduct of the formulation snapshot — they regenerate every session end (hook order: session-summary → formulation → therapy-plan → calibration → memory-blocks). They are never persisted independently with their own IDs.

**How to apply:** New feature needs a dedicated table to give questions stable IDs and make them answerable across sessions.

## Key files
- `apps/server/src/services/formulation-service.ts` — full generation pipeline + prompt schema
- `apps/server/src/db/schema/user-formulations.ts` — snapshot JSONB table (no per-question IDs)
- `apps/web/src/components/journey/reflective-questions.tsx` — read-only display, slices first 3 questions
- `apps/web/src/stores/journey-store.ts` — JourneyFormulation type: `questionsWorthExploring: Array<{ question, rationale, linkedTo }>`
- `apps/server/src/routes/journey.ts` — GET /insights returns formulation snapshot (no questions endpoint)
- `apps/server/src/session/bootstrap.ts` — injects top 2 questions as session goals with turn-8 deadline

## Integration points that would need to know about answered reflections
1. `session/bootstrap.ts` — `formatFormulationContext()` already reads `questionsWorthExploring` from formulation and injects as SESSION GOALS. Answered questions should be suppressed from this injection or annotated "(answered out-of-session)".
2. `services/therapy-plan-service.ts` — prompt currently uses session summaries + memories + formulation. Would benefit from answered reflections as additional evidence.
3. `services/formulation-service.ts` — generates new questions. Should avoid re-generating questions already answered.
4. `services/memory-block-service.ts` — `user/overview`, `user/goals`, `user/triggers`, `user/relationships` blocks rewritten at session end. Answered reflections can feed these.
5. `hooks/session-hooks.ts` — onEnd `user-memory-blocks` hook calls Claude to rewrite all 7 named blocks. Could consume reflection answers as additional context.

## Current migration state
Latest migration is `0020_cynical_tombstone.sql` (added `voice_metrics` column to sessions). Migration 0016 added `formative_experience` enum. Last table created: `turn_events` (0018/0019 area).
