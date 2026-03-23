---
name: Multi-model validation pipeline (Phase 3)
description: Gemini and Codex CLIs as parallel post-response reviewers alongside Claude Haiku; controlled by GEMINI_ENABLED / CODEX_ENABLED env vars
type: project
---

Multi-model agent team implemented 2026-03-23. Three reviewers run in parallel after every AI response (fire-and-forget):

- **Claude Haiku**: safety validator (always runs) -- existing logic preserved
- **Gemini**: conversational quality + probing depth (opt-in via `GEMINI_ENABLED`)
- **Codex**: MI-OARS framework adherence (opt-in via `CODEX_ENABLED`, every 3rd turn)

**Why:** Single-model validation only catches safety issues. Gemini and Codex add quality and framework compliance dimensions without adding latency (all fire-and-forget).

**How to apply:** When modifying the validation pipeline, changes to `cli-spawner.ts` affect all three reviewers. The `multi-validator.ts` orchestrator uses `Promise.allSettled` so one failure never blocks others. Legacy `validatorRan/validatorScore/validatorSafe` fields in `turn_events` are back-populated from the Haiku result for backwards compatibility.
