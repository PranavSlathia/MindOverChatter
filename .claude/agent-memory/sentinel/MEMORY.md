# Sentinel Memory

> Code review patterns, common issues, therapeutic safety audit findings.

---

## Resolved Issues (Phase 4-A → Phase 7)

The following Phase 4-A findings are now resolved and confirmed fixed:
- `SubmitAssessmentSchema` answer-count gap: fixed with `.superRefine()` checking exact count per type
- `assessment.start` SSE event dead code: fixed — `streamAiResponse` now strips `[ASSESSMENT_READY:type]` markers and emits the event
- `CreateAssessmentSchema` deprecated export: REMOVED entirely, no longer in shared package
- `assessment-flow.md` marker parser: IMPLEMENTED in `sessions.ts` `streamAiResponse`

## Resolved Issues (Phase 7 → commit c9742eb)

The following Phase 7 WARNING findings are now resolved:
- `assessment.complete` SSE nextScreener not auto-triggering next widget: FIXED in chat.tsx — the `assessment.complete` handler now calls `startAssessment()` when `nextScreener` is non-null.
- Hardcoded DB credentials in docker-compose.yml: FIXED — all passwords now use `${DB_PASSWORD:?DB_PASSWORD is required}` syntax.
- Hono RPC client not used on frontend: FIXED — `apps/web/src/lib/api.ts` now uses `hc<AppType>()` for all routes. `deleteSession` and `resumeSession` still use raw fetch (noted in comments as "routes implemented in parallel") — acceptable.
- MEMORY_TYPES constant vs validator gap: The `validTypes` array in `memory-client.ts:persistProvenance` is hardcoded to 11 types including `session_summary`. This is consistent with the DB schema. The MEMORY_TYPES constant in shared is not used for enforcement, so the gap is benign but still present.

## Active Issues (as of commit c9742eb)

### Negation spillover (known design limitation, not a safety gap)
- Window-based negation can mark 'want to die' as negated in 'I'm not suicidal but I want to die'
  because the word 'not' in 'not suicidal' falls within the 25-char window before 'want to die'.
- This is NOT a safety gap: the message routes to Haiku (Stage 2) for nuanced classification.
  Haiku will see the full message and correctly classify 'want to die' as crisis.
- The Haiku-failure fallback (isCrisis=true) preserves safety if Haiku is down.
- This design limitation should be documented as a known trade-off, not fixed without careful testing.

### Summary generation uses Claude (not Haiku) via spawnClaudeStreaming
- `generateAndPersistSummary` in sessions.ts calls `spawnClaudeStreaming` with a summarization prompt.
- This spawns the full Claude Sonnet model for session summaries.
- The SUMMARY_PROMPT is hard-coded with "wellness companion" framing and no therapeutic claims.
- This is NOT a crisis-response path — purely informational summary. Acceptable.

### Groq used for assessment eligibility (sessions.ts checkAssessmentEligibility)
- Groq fallback for assessment detection calls `env.GROQ_API_KEY`.
- Key is loaded from environment via validated `env.ts` schema — not hardcoded. CLEAN.
- Groq failure is handled gracefully (returns early on non-ok response). CORRECT.

### Assessment eligibility check runs AFTER AI response is sent
- `checkAssessmentEligibility()` is called inside `streamAiResponse()` after the AI response completes.
- This means there is a message-count trigger window where assessment.start could fire TWICE per turn:
  once from Claude's `[ASSESSMENT_READY:...]` marker (primary path) and once from the deterministic detector.
- The `completedTypes` guard prevents duplicate widgets for the SAME assessment type.
- But if Claude emits gad7 marker AND the detector independently triggers phq9, both fire in same turn.
- This is a UX issue (two widgets queued), not a safety issue.

### `screenerResults` column never written (pre-existing)
- `assessments.screener_results jsonb` column defined in schema, never populated.
- Comment says "Phase 4-B: populated by formulation engine". Known tech debt.

### MEMORY_TYPES constant missing `session_summary` (pre-existing)
- `packages/shared/src/constants/index.ts` MEMORY_TYPES has 10 types (no `session_summary`).
- Validator and schema have 11 types. Low-risk drift.

### emotion service produces labels outside shared EMOTION_LABELS enum (pre-existing)
- `services/emotion/main.py` emits `excited`, `calm`, `anxious`.
- Frontend `EmotionScores` type won't have those keys. DB stores as text so no crash.

### CORS not configured (pre-existing)
- No CORS middleware on Hono server.

## Safety Patterns (confirmed correct as of commit c9742eb)

### Crisis detection — fully intact + negation handling added
- `detectCrisis()` runs on EVERY user message in `POST /:id/messages` before any Claude call.
- Non-negated HIGH keyword -> immediate crisis (no Haiku, ~0ms).
- Negated HIGH keyword -> Stage 2 Haiku for nuanced classification.
- Haiku failure with negated HIGH -> err on caution, isCrisis=true (conservative).
- MEDIUM keyword -> Stage 2 Haiku always.
- Haiku failure with MEDIUM -> err on caution, isCrisis=true.
- Subtle signals only -> Stage 2 Haiku; if Haiku fails -> isCrisis=false (acceptable: no keyword hit).

### isNegated logic is all-or-nothing for high matches
- isNegated=true ONLY if ALL high-severity matches are negated.
- One non-negated high match among multiple matches -> isNegated=false -> immediate crisis.
- This is the correct design to prevent false negatives.

### Crisis response — hard-coded, never AI-generated (unchanged)
- Static constants in crisis-response.ts.

### Helpline numbers — CORRECT (unchanged)
- 988 (US), iCall 9152987821 (IN), Vandrevala 1860-2662-345 (IN).

### Framing compliance — confirmed (unchanged)
- SUMMARY_PROMPT in sessions.ts: "NOT a therapist" framing, warm non-clinical language.
- "wellness companion" in prompts.

### Hono RPC type chain — RESTORED
- api.ts now uses `hc<AppType>()` — type chain is end-to-end.
- `deleteSession` and `resumeSession` use raw fetch (commented as known gap, types manually maintained).

## Approved Patterns (stable)

### Self-referential FK with `(): any`
- Drizzle's documented workaround for circular references. Intentional.

### Module-level caches with test reset exports
- `cachedSkills`/`resetSkillCache()` and `cachedUserId`/`_resetCachedUserId()`. Correct.

### Server-side scoring only
- `SubmitAssessmentSchema` does not accept `totalScore` or `severity`. Correct.

### Assessment markers stripped before SSE/DB
- `ASSESSMENT_MARKER_RE` strips `[ASSESSMENT_READY:phq9|gad7]` from AI output. Confirmed.

### negatedHindiPhrase double-registration pattern
- Phrases like "marna chahta" appear in BOTH `hindiPhrase(...)` and `negatedHindiPhrase(...)`.
- The hindiPhrase matches the affirmative form (crisis).
- The negatedHindiPhrase matches the negated form (routes to Haiku).
- Because the two regex patterns are mutually exclusive (hindiPhrase won't match 'marna nahi chahta'),
  only the relevant entry fires for any given input. highMatchCount stays correct.
- This is an intentional and correct design. Not a bug.
