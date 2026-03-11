# Sentinel Memory

> Code review patterns, common issues, therapeutic safety audit findings.

---

## Resolved Issues (Phase 4-A → Phase 7)

The following Phase 4-A findings are now resolved and confirmed fixed:
- `SubmitAssessmentSchema` answer-count gap: fixed with `.superRefine()` checking exact count per type
- `assessment.start` SSE event dead code: fixed — `streamAiResponse` now strips `[ASSESSMENT_READY:type]` markers and emits the event
- `CreateAssessmentSchema` deprecated export: REMOVED entirely, no longer in shared package
- `assessment-flow.md` marker parser: IMPLEMENTED in `sessions.ts` `streamAiResponse`

## Active Issues (Phase 7 audit findings)

### `screenerResults` column never written
- `assessments.screener_results jsonb` column defined in schema, never populated by any route.
- Comment says "Phase 4-B: populated by formulation engine". Either implement or remove.
- Filed as WARNING (known tech debt, not a safety issue).

### MEMORY_TYPES constant missing `session_summary`
- `packages/shared/src/constants/index.ts` exports `MEMORY_TYPES` with 10 types (no `session_summary`).
- But `packages/shared/src/validators/memory.ts` `MemoryTypeSchema` and `apps/server/src/db/schema/memories.ts` `memoryTypeEnum` both include `session_summary` (11 types).
- The constant is inconsistent with the validator and schema. Low risk since the constant is not used for enforcement, but drift is a code-quality issue.

### Deprecated `SessionHistorySchema` in session.ts
- Exported but never used anywhere. Remove to reduce dead exports.

### Hardcoded DB credentials in docker-compose.yml
- `POSTGRES_PASSWORD: password` and `DATABASE_URL=postgresql://moc:password@db:5432/moc` are hardcoded.
- Acceptable for local dev but must use ${DB_PASSWORD} env substitution for any non-local deploy.

### Hono RPC client not used on frontend
- `apps/web/src/lib/api.ts` uses raw `fetch()` with manually-typed interfaces.
- The type chain is broken: Hono route types (`AppType`) exist but the frontend does not consume them via `hc<AppType>()`.
- This is a WARNING not CRITICAL because types are manually maintained and consistent at time of audit.

### emotion service produces labels outside shared EMOTION_LABELS enum
- `services/emotion/main.py` emits `excited`, `calm`, `anxious` as emotion labels.
- `packages/shared/src/constants/emotions.ts` `EMOTION_LABELS` only has: happy, sad, angry, neutral, fearful, disgusted, surprised.
- Schema `emotion_readings.emotionLabel` is `text()` so no DB error, but the frontend's `EmotionScores` type in `emotion-store.ts` will receive unknown keys.

### assessment.complete SSE — nextScreener not auto-triggering next widget
- When `assessment.complete` arrives with a non-null `nextScreener`, the frontend calls `completeAssessment()` which stores the result but does NOT call `startAssessment()`.
- The next screener widget only appears if another `assessment.start` SSE event arrives (which requires the AI to produce another `[ASSESSMENT_READY:...]` marker).
- This is a gap in the screener chaining UX but not a safety issue.

### CORS not configured
- No CORS middleware on the Hono server. Single-user, same-origin app makes this low priority for local dev, but needed for any external access scenario.

### Security headers absent
- No Helmet-equivalent headers (CSP, X-Frame-Options, etc.) on the Hono server. Acceptable for local personal app.

## Safety Patterns (confirmed correct as of Phase 7)

### Crisis detection — fully intact
- `detectCrisis()` runs on EVERY user message in `POST /:id/messages` before any Claude call.
- Two-stage: keyword (deterministic, ~0ms) + Haiku classifier (LLM, ~1-5s).
- Fallback on Haiku failure: keyword result used conservatively.
- Assessment route (POST /api/assessments) receives only numeric arrays — no crisis detection needed there.

### Crisis response — hard-coded, never AI-generated
- `crisis-response.ts`: `HIGH_SEVERITY_MESSAGE` and `MEDIUM_SEVERITY_MESSAGE` are static string constants.
- `getCrisisResponse()` returns one of the two static messages based on severity. No AI call path.

### Helpline numbers — CORRECT
- 988 (US), iCall 9152987821 (IN), Vandrevala 1860-2662-345 (IN) all present in `HELPLINES` constant.
- Used in both `crisis-response.ts` and `CrisisBanner` component.

### Framing compliance — confirmed
- SYSTEM_PROMPT: "You are NOT a therapist, counselor, or medical professional."
- Crisis response messages: "This app is a wellness companion, not a replacement for professional help."
- Assessment context injection: no raw scores exposed, no diagnostic labels.
- `SEVERITY_DESCRIPTIONS`: descriptive phrases only, no clinical labels.

### Prompt injection protection — confirmed
- All dynamic content (memories, skills, context injections, conversation history, user message) wrapped with `delimit()`.
- Delimiter boundary pattern is non-standard and unlikely to appear in user text.

## Approved Patterns (stable)

### Self-referential FK with `(): any`
- Drizzle's documented workaround for circular references. Intentional, not missed.

### Module-level caches with test reset exports
- `cachedSkills` / `resetSkillCache()` in session-manager.ts.
- `cachedUserId` / `_resetCachedUserId()` in db/helpers.ts.
- Both correct patterns for single-user app.

### Server-side scoring only
- `SubmitAssessmentSchema` does not accept `totalScore` or `severity`. Correct.
- `computeSeverity()` is pure and deterministic.

### Assessment markers stripped before SSE/DB
- `ASSESSMENT_MARKER_RE` regex strips `[ASSESSMENT_READY:phq9|gad7]` from AI output.
- Clean text stored in DB, marker triggers `assessment.start` SSE event.
