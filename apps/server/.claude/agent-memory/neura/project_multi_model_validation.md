---
name: Multi-model validation pipeline
description: Gemini as primary post-response reviewer (Haiku removed 2026-03-24), Codex as opt-in secondary; controlled by GEMINI_ENABLED / CODEX_ENABLED env vars
type: project
---

Multi-model agent team implemented 2026-03-23, updated 2026-03-24.

- **Gemini**: primary reviewer — conversational quality + probing depth (opt-in via `GEMINI_ENABLED`). Runs every turn.
- **Codex**: MI-OARS framework adherence (opt-in via `CODEX_ENABLED`, every 3rd turn)
- **Claude Haiku "primary"**: REMOVED (2026-03-24) — failed 100% of the time (0/13 success), wasted a CLI spawn per turn. Gemini handles safety validation effectively (9/13 success, score 1.0).

**Why:** Single-model validation only catches safety issues. Gemini and Codex add quality and framework compliance dimensions without adding latency (all fire-and-forget). The Haiku reviewer was removed because the CLI spawner consistently failed for it.

**How to apply:** When modifying the validation pipeline, changes to `cli-spawner.ts` affect all reviewers. The `multi-validator.ts` orchestrator uses `Promise.allSettled` so one failure never blocks others. Legacy `validatorRan/validatorScore/validatorSafe` fields in `turn_events` are back-populated from the first successful reviewer result (was Haiku, now Gemini).
