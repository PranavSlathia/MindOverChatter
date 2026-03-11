# Assessment Hub — Implementation Progress

## Overview
Adding 11 new validated psychological instruments to the app, with a standalone Assessments page, scoring, and Journey formulation integration.

## New Instruments

| Type Key | Instrument | Items | Scale | Wave |
|----------|-----------|-------|-------|------|
| `dass21` | DASS-21 (Depression/Anxiety/Stress) | 21 | 0-3 | 1 |
| `rosenberg_se` | Rosenberg Self-Esteem Scale | 10 | 0-3 | 1 |
| `who5` | WHO-5 Well-Being Index | 5 | 0-5 | 1 |
| `phq4` | PHQ-4 Ultra-Brief Screener | 4 | 0-3 | 1 |
| `pc_ptsd5` | PC-PTSD-5 PTSD Screen | 5 | 0-1 | 1 |
| `ipip_big5` | IPIP Big Five Personality (50-item) | 50 | 1-5 | 2 |
| `ucla_loneliness` | UCLA Loneliness Scale v3 | 20 | 1-4 | 2 |
| `copenhagen_burnout` | Copenhagen Burnout Inventory | 19 | 0-4 | 2 |
| `ace_score` | Adverse Childhood Experiences | 10 | 0-1 | 2 |
| `isi` | Insomnia Severity Index | 7 | 0-4 | 2 |
| `harrower_inkblot` | Harrower-Erickson MCR (Inkblot) | 10 | 0-2 | 2 |

## COMPLETE

### 1. Shared Types (`packages/shared/src/validators/assessment.ts`)
- [x] Extended `AssessmentTypeSchema` with all 11 new types
- [x] Added `ASSESSMENT_QUESTION_COUNTS` for all new types
- [x] Added per-type answer range validation (`MAX_ANSWER_VALUES`, `MIN_ANSWER_VALUES`)
- [x] Made `sessionId` optional in `SubmitAssessmentSchema` (standalone support)
- [x] Widened answer range from `0-3` to `0-5` with per-type superRefine validation

### 2. DB Schema (`apps/server/src/db/schema/assessments.ts`)
- [x] Added all 11 new values to `assessmentTypeEnum` pgEnum

### 3. Scoring Functions (`apps/server/src/routes/assessment-scoring.ts`)
- [x] All 11 instruments scored with proper thresholds
- [x] Updated `computeSeverity()` switch to handle all new types

### 4. Assessment Context (`apps/server/src/routes/assessment-context.ts`)
- [x] Human-readable labels for all 19 types
- [x] Special framing for personality and ACE instruments

### 5. Assessment Routes (`apps/server/src/routes/assessments.ts`)
- [x] `GET /library` — returns latest result per assessment type
- [x] `GET /history/:type` — returns assessment history for a specific type
- [x] `POST /` — supports optional `sessionId` (standalone assessments)

### 6. DB Migration
- [x] Generated `drizzle/0004_slow_thaddeus_ross.sql` — 11 ALTER TYPE ADD VALUE statements
- [x] Applied migration successfully

### 7. Frontend Assessment Data (`apps/web/src/data/assessment-questions.ts`)
- [x] Extended `AssessmentDefinition` with `category` and `estimatedMinutes`
- [x] Added `AssessmentCategory` type and `CATEGORY_LABELS` map
- [x] All 11 instruments with proper option scales
- [x] `getAssessmentsByCategory()` helper for grouped display

### 8. Frontend Assessments Page (`apps/web/src/pages/assessments.tsx`)
- [x] Library page with category-grouped instrument cards
- [x] Cards show: name, description, item count, time, last taken date + severity
- [x] Click navigates to `/assessments/:type`
- [x] Loading/error states

### 9. Frontend Assessment Flow (`apps/web/src/pages/assessment-flow.tsx`)
- [x] Standalone test-taking UI (same UX pattern as assessment-widget)
- [x] Supports all option scales via per-instrument `options` array
- [x] Progress bar, question-by-question navigation
- [x] Submits to `POST /api/assessments` without sessionId
- [x] Results screen with non-clinical severity + "not a diagnosis" disclaimer
- [x] "Back to Library" and "Talk About It" CTAs

### 10. Navigation Updates
- [x] `/assessments` and `/assessments/:type` routes in `app.tsx`
- [x] "Assess" tab in `bottom-tab-bar.tsx` (checkbox icon)
- [x] Page titles in `app-shell.tsx` for both routes

### 11. API Client (`apps/web/src/lib/api.ts`)
- [x] `getAssessmentLibrary()` — type-safe via Hono RPC
- [x] `getAssessmentHistory(type)` — type-safe via Hono RPC
- [x] `submitAssessment()` accepts optional sessionId

### 12. Build & Verify
- [x] `pnpm turbo build` passes with 0 errors (server + web)
- [x] Type chain verified: Drizzle schema -> Zod -> Hono routes -> Hono RPC client
- [x] 448 server tests passing

## Architecture Notes

- **Standalone vs Session-based**: sessionId is now optional. Session-based assessments (from chat) still inject results into the SDK session + emit SSE. Standalone assessments only store to DB + fire memory extraction.
- **Formulation Integration**: The Journey formulation engine already reads from the `assessments` table, so all new instruments automatically feed into the 5Ps formulation.
- **Personality instruments**: Big Five and Harrower don't use severity framing. The context block uses exploratory language instead.
- **ACE sensitivity**: ACE score uses gentle framing in the context block. No diagnostic language.
- **Answer validation**: Per-type range validation in Zod superRefine (e.g., WHO-5 allows 0-5, IPIP allows 1-5, ACE allows 0-1).
