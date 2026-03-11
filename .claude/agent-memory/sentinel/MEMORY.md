# Sentinel Memory

> Code review patterns, common issues, therapeutic safety audit findings.

---

## Common Issues

### Assessment answer-count validation gap (Phase 4-A)
- `SubmitAssessmentSchema` only enforces `.min(1)` on `answers` array — no upper bound per type.
- PHQ-9 expects exactly 9, GAD-7 exactly 7. A client submitting 50 answers would inflate totalScore and change severity band.
- Fix: add a `.max()` per type OR validate `answers.length === EXPECTED_COUNT[type]` in the route before calling `computeSeverity`.
- `screenerSeverity()` in assessment-scoring.ts already handles wrong lengths gracefully by falling back to `answers.length`, but the scoring distortion is real.

### `screenerResults` column never written (Phase 4-A)
- Schema defines `screener_results jsonb`, but the assessment route does not populate it.
- Either remove the column or document its intended writer.

### `assessment.start` SSE event is dead code (Phase 4-A)
- `SSEEventData` union and `SSEEventType` in shared types both declare `assessment.start`, but no route emits it.
- The frontend will never receive this event. Either implement the emitter or remove from both union types.

### `CreateAssessmentSchema` deprecated but not removed (Phase 4-A)
- `CreateAssessmentSchema` accepts `totalScore` and `severity` from client — the opposite of the security model.
- Marked deprecated in a comment, but still exported from shared package. Any future developer could accidentally import it for a new route. Should be deleted once confirmed nothing references it.

### `(): any` self-referential FK type escape (Phase 4-A)
- `parentAssessmentId` FK uses `(): any` to satisfy circular reference. This is the correct Drizzle workaround but must be flagged as intentional, not missed. Pattern is acceptable for self-referential tables.

## Safety Patterns

### Skill files: formulation templates correctly marked internal-only
- All 5 probing skill files explicitly state "For internal tracking only. NEVER shown to the user. NEVER use diagnostic labels."
- Safety trigger sections in every skill file correctly instruct escalation to crisis protocol.
- This pattern is approved — Neura followed it correctly.

### `assessment-flow.md` marker pattern
- `[ASSESSMENT_READY:phq9]` / `[ASSESSMENT_READY:gad7]` markers are designed to be stripped by the message route before display.
- The stripping logic is NOT yet implemented in `sessions.ts` — the marker would be passed raw to SSE and stored in DB as part of the AI response.
- This is a Phase 4-A gap: the marker parser must be added to `streamAiResponse` before the UI ships.

### Crisis detection confirmed intact for Phase 4-A
- `sessions.ts` POST /:id/messages still runs `detectCrisis(text)` before any Claude call.
- Assessment route does NOT need crisis detection (it receives numeric answers, not text).
- Skill files all contain Safety Triggers sections directing escalation to existing crisis protocol.

### Framing compliance confirmed
- `SYSTEM_PROMPT` in session-manager.ts: "You are NOT a therapist, counselor, or medical professional."
- All skill file formulation templates: "NEVER use diagnostic labels."
- `assessment-flow.md`: "NEVER quote raw scores to the user as a diagnostic indicator."
- Helpline numbers (988, iCall, Vandrevala) remain in crisis-response.ts (unchanged by Phase 4-A).

## Approved Patterns

### `delimit()` wrapping
- All dynamic content in `assemblePrompt()` is wrapped: memories, skills, context injections, conversation history, current user message.
- Skill file contents loaded from disk (trusted source) are also delimited — belt-and-suspenders approach is correct.
- `injectSessionContext()` takes a string from the server — not user-controlled — so no injection risk at call site. Caller responsibility pattern is acceptable given single-author codebase.

### Server-side scoring only
- `SubmitAssessmentSchema` does not accept `totalScore` or `severity`. Confirmed by validator tests (lines 108-128).
- `computeSeverity()` is pure, deterministic, and well-tested at all boundary values.

### Screener chain determinism
- `PHQ9_SCREENER_CHAIN` and `GAD7_SCREENER_CHAIN` are plain `Record` constants — no randomness.
- `getNextScreener()` is deterministic set-subtraction. Tested exhaustively.

### `getOrCreateUser()` extraction to `db/helpers.ts`
- Clean refactor. Module-level cache with reset export for testing. Correct pattern.

### Self-referential FK with `(): any`
- Drizzle's documented pattern for circular self-references. Acceptable.

### Migration is additive
- `0002_flawless_speedball.sql`: only ADDs enum values and columns. No drops. Correct.

### `cachedSkills` module-level cache + `resetSkillCache()` for testing
- Cache is set only after first successful load. `resetSkillCache()` exported for test isolation. Correct pattern.
