# MindOverChatter Research Sandbox

Operational reference for the autoresearch sandbox. For invariant rules, isolation contracts,
and schema policy see [README.md](./README.md).

---

## Overview

The research sandbox lets you run offline experiments against live user data without touching
the live therapeutic state. All reads come from the live application database. All writes go
to isolated `research_*` tables. Only the **promote step** (with human review) can write back
to the live system.

```
RESEARCH_ENABLED=true must be set in .env.local to enable all research routes and scripts.
```

---

## Architecture Diagram

```
                    RESEARCH SANDBOX
                    ================

  Operator
     │
     ├─ CLI: tsx apps/server/src/research/scripts/run-experiment.ts
     │        --experiment [a|b|c|d|e] --user <userId>
     │                OR
     └─ HTTP: POST /api/research/run
              { experiment, userId, candidateContent? }
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
    runExperimentA()     runExperimentB/C/D/E()
          │
          ▼
  [READ-ONLY] Live DB queries
  (sessions, messages, memories, therapy_plans,
   assessments, user_formulations, memory_blocks)
          │
          ▼
  Haiku LLM call(s) — analysis / scoring
          │
          ▼
  Write results to research_* table
  + Write markdown to research/reports/
          │
          ▼
  GET /api/research/results/:userId   ← list all runs
  GET /api/research/report/:runId     ← reconstruct report
          │
          ▼
  [If gate=PASS] POST /api/research/promote
          │
          ▼
  promote.ts writes to live system
  (e.g., memory_blocks for calibration,
         OR operator reviews direction files manually)
```

---

## Experiments

### Experiment A — Outcome-Gated Calibration Evaluator

**File**: `experiments/experiment-a-calibration.ts`
**DB Table**: `research_calibration_proposals`

Proposes a rewrite of the `companion/therapeutic_calibration` memory block, gated against the
user's PHQ-9 / GAD-7 outcome trajectory. This is the only experiment that can write back to a
live memory block (via `promote.ts`).

| Field | Value |
|-------|-------|
| LLM | Claude Haiku (spawnClaudeStreaming) |
| Input | Live calibration block + assessment trajectory |
| Output | Proposed calibration text (≤ 700 chars) |
| Gate criterion | `gateDecision: "keep"` — score > 0.5, safetyPassed, len ≤ 800 chars |
| Hard gate | Worsening trajectory (score < 0.4) → always `"discard"` |

**Gate decisions**: `"keep"` | `"discard"` | `"insufficient_data"`

**Promotion**: On `"keep"`, call `POST /api/research/promote { runId, experiment: "a" }` or
`--promote --experiment a --run-id <uuid>` from the CLI. Promotion calls `upsertBlock()` on
`companion/therapeutic_calibration`.

---

### Experiment B — Hypothesis Confidence Drift

**File**: `experiments/experiment-b-hypotheses.ts`
**DB Table**: `research_hypothesis_simulations`

Simulates how session outcomes would shift therapy plan hypothesis confidence scores over
time. No hard gate — this is a monitoring and trend-detection metric.

| Field | Value |
|-------|-------|
| LLM | Claude Haiku |
| Input | All therapy plans + sessions for the user |
| Output | Hypothesis delta statistics (mean delta, max delta, high-drift count) |
| Gate criterion | None — monitoring metric only |

**No promotion path.** Operator reviews the drift report to inform manual plan adjustments.

---

### Experiment C — Direction Compliance Tracker

**File**: `experiments/experiment-c-direction.ts`
**DB Table**: `research_direction_compliance`

Scores each session against the active directives in `therapeutic-direction.md`. Measures how
well the companion's responses comply with current steering directives and mode assignments.

| Field | Value |
|-------|-------|
| LLM | Claude Haiku |
| Input | Session messages + active directives from therapeutic-direction.md |
| Output | Compliance score (0–1) per session, mode alignment flag |
| Gate criterion | None — monitoring metric only |

**No promotion path.** Low compliance scores signal that direction file changes may be needed.

---

### Experiment D — Offline Replay Harness

**File**: `experiments/experiment-d-replay.ts`
**DB Table**: `research_replay_runs`

Scores a baseline `therapeutic-direction.md` against a candidate version using real session
transcripts. The 3-gate structure ensures the candidate is only promoted when it demonstrably
outperforms the baseline.

| Field | Value |
|-------|-------|
| LLM | Claude Haiku (turn-by-turn rubric scoring, 0–100) |
| Input | Baseline direction + candidate direction + session history |
| Output | Gate verdicts, mean scores, trajectory review |
| Gate criterion | Gate 2: candidate_mean ≥ 70 AND candidate_mean ≥ baseline_mean − 2.0 |

**Gate decisions**: `"keep"` | `"discard"` | `"insufficient_sessions"`

#### Experiment D — Gate Flow

```
Experiment D — Gate Flow
========================

  Input: baseline direction + candidate direction + session history

  Pre-check: DATA SUFFICIENCY
    └─ Need ≥ 1 session with ≥ 3 turns each
    └─ FAIL → gateDecision: "insufficient_sessions", STOP

  Gate 1: SAFETY AUDIT (per turn)
    └─ Haiku checks each turn for: crisis_miss, diagnosis_language,
       internal_note_leakage
    └─ Any failure → turn flagged in gate1Checks

  Gate 2: QUALITY SCORE (per turn)
    └─ Score each turn against candidate and baseline (0–100 Haiku rubric)
    └─ candidateMean >= 70 AND candidateMean >= baselineMean - 2.0 required
    └─ FAIL → gateDecision: "discard", STOP

  Gate 3: TRAJECTORY REVIEW
    └─ Compare PHQ-9/GAD-7 scores across the sessions
    └─ Flag for operator review if worsening trajectory (score < 0.4)
       despite Gate 2 pass
    └─ PASS or FLAGGED_FOR_REVIEW

  Final: gateDecision = "keep" | "discard" | "insufficient_sessions"
```

**Promotion**: On `"keep"`, the operator reviews the candidate file and manually copies it to
`therapeutic-direction.md`. Call `POST /api/research/promote { runId, experiment: "d" }` to
record the promotion timestamp. The direction file itself must be updated manually — promote.ts
does not overwrite it automatically.

---

### Experiment E — Developmental Coverage Tracker

**File**: `experiments/experiment-e-developmental.ts`
**DB Table**: `research_developmental_coverage`

Measures per-session coverage of 5 developmental probing dimensions from
`probing-development.md`. Useful for detecting when the `deepen_history` mode is being
used and how deeply the attachment/schema/family work is progressing across sessions.

| Field | Value |
|-------|-------|
| Scoring | Heuristic keyword matching (no LLM — see `dataGaps` in every result) |
| Input | Session messages + session summaries for the user |
| Output | Coverage scores across 5 dimensions (0–1 each) |
| Gate criterion | None — monitoring metric only |

**Dimensions tracked**:
1. `attachment_quality` — Bowlby-style caregiver responsiveness probing
2. `family_climate` — Bowen family systems, emotional climate questions
3. `schema_formation` — Young schema: worth, love, trust, autonomy
4. `formative_events` — Specific pivotal events identified and explored
5. `origin_bridging` — Explicit connection from past patterns to present

**No promotion path.** Low dimension scores indicate under-explored developmental territory.

---

## Database Tables

All tables are in the live PostgreSQL instance but are logically isolated from the live stack
(see `README.md`, Rule 3). Five tables total:

| Table | Experiment | Purpose |
|-------|------------|---------|
| `research_calibration_proposals` | A | Proposed calibration rewrites with gate verdicts and outcome scores |
| `research_hypothesis_simulations` | B | Hypothesis drift analysis across plans and sessions |
| `research_direction_compliance` | C | Per-session compliance scores with active directives |
| `research_replay_runs` | D | Baseline vs candidate scoring results with turn-level data |
| `research_developmental_coverage` | E | 5-dimension developmental probing coverage per session |

All tables carry `experiment_run_id`, `experiment_version`, `ran_at`, and optional
`promoted_at` / `promoted_by` columns for auditability.

Schema files: `research/db/schema/research-{calibration-proposals,hypothesis-simulations,direction-compliance,replay-runs,developmental-coverage}.ts`

---

## CLI Runner

**File**: `scripts/run-experiment.ts`

Run from the repo root:

```bash
# Run a single experiment
tsx apps/server/src/research/scripts/run-experiment.ts --experiment a --user <userId>
tsx apps/server/src/research/scripts/run-experiment.ts --experiment b --user <userId>
tsx apps/server/src/research/scripts/run-experiment.ts --experiment c --user <userId>
tsx apps/server/src/research/scripts/run-experiment.ts --experiment d --user <userId>
tsx apps/server/src/research/scripts/run-experiment.ts --experiment e --user <userId>

# Run Experiment D with a candidate direction file
tsx apps/server/src/research/scripts/run-experiment.ts \
  --experiment d --user <userId> \
  --candidate-file apps/server/src/research/candidates/therapeutic-direction-v2.1.md

# Run all experiments sequentially
tsx apps/server/src/research/scripts/run-experiment.ts --experiment all --user <userId>

# Promote a gate-approved run
tsx apps/server/src/research/scripts/run-experiment.ts \
  --promote --experiment a --run-id <uuid>
```

Output: JSON printed to `stdout`. Markdown reports written to `research/reports/`.
Errors go to `stderr` with a non-zero exit code.

---

## HTTP Routes

All routes require `RESEARCH_ENABLED=true`. Returns `403` otherwise.

### POST /api/research/run

Run one or all experiments for a user.

```json
// Request
{
  "experiment": "a" | "b" | "c" | "d" | "e" | "all",
  "userId": "<uuid>",
  "candidateContent": "<optional — candidate direction text for experiment D>"
}

// Response
{
  "ok": true,
  "reports": [ /* array of experiment result objects */ ]
}
```

### GET /api/research/results/:userId

Returns the last 10 rows from each research table for the user. Large blob columns
(`proposedContent`, `assessmentTrajectory`, `turnScores`, etc.) are intentionally omitted.

```json
{
  "ok": true,
  "results": {
    "calibrationProposals": [ /* last 10 Exp A rows */ ],
    "hypothesisSimulations": [ /* last 10 Exp B rows */ ],
    "directionCompliance": [ /* last 10 Exp C rows */ ],
    "replayRuns": [ /* last 10 Exp D rows */ ]
  }
}
```

### GET /api/research/report/:runId?experiment=a|b|c|d|e

Reconstructs the JSON report for a specific run. Note: Experiment E reports cannot be
reconstructed from a `runId` — returns `501`.

### POST /api/research/promote

Promotes a gate-approved run to live state (Experiment A) or records operator review
acknowledgment (B/C/D).

```json
// Request
{
  "runId": "<uuid>",
  "experiment": "a" | "b" | "c" | "d",
  "force": false  // optional — bypass gate check (emergency override)
}

// Response (success)
{ "ok": true, "message": "...", "promotedAt": "..." }

// Response (failure)
{ "ok": false, "error": "..." }
```

---

## Promotion Workflow

### Experiment A — Calibration Block Promotion

```
Promotion Flow (Experiment A)
==============================

  POST /api/research/promote
  { runId, experiment: "a" }
        │
        ▼
  promote.ts: load research_calibration_proposals row
        │
        ▼
  Validate: gateDecision === "keep" AND safetyPassed === true
        │
        ▼
  upsertBlock("companion/therapeutic_calibration", proposedContent)
        │
        ▼
  Mark row as promoted_at = now()
```

### Experiment D — Direction File Promotion

Experiment D does **not** automatically overwrite `therapeutic-direction.md`. The promotion
step only records that the operator reviewed and accepted the candidate. The operator must
manually copy the candidate file into place:

```bash
# 1. Review the candidate
cat apps/server/src/research/candidates/therapeutic-direction-v2.1.md

# 2. Run Experiment D and check gate
tsx apps/server/src/research/scripts/run-experiment.ts \
  --experiment d --user <userId> \
  --candidate-file apps/server/src/research/candidates/therapeutic-direction-v2.1.md

# 3. If gateDecision === "keep", promote (records timestamp + operator notes)
tsx apps/server/src/research/scripts/run-experiment.ts \
  --promote --experiment d --run-id <uuid>

# 4. Manually copy candidate to live location
cp apps/server/src/research/candidates/therapeutic-direction-v2.1.md \
   .claude/skills/therapeutic-direction.md

# 5. Bump version: and rationale: fields in the file header
```

---

## RESEARCH_ENABLED Setup

Add to `.env.local`:

```
RESEARCH_ENABLED=true
```

This flag is checked by the route middleware and by the CLI runner. It must **never** be set in
production without explicit operator sign-off. Research experiments make CPU/DB-intensive Haiku
calls that can interfere with live session performance.

---

## Report Files

Markdown reports are written to `research/reports/` after each experiment run. This directory
is **gitignored** (see `README.md`, Rule 4) — reports contain real session content and must
never be committed. The directory is preserved via `.gitkeep`.

Report filenames follow the pattern:
```
research/reports/<experiment>-<runId>-<timestamp>.md
```

---

## Candidates Pipeline

The `research/candidates/` directory holds candidate `therapeutic-direction.md` drafts for
Experiment D evaluation. Files here are **not** gitignored — they are versioned work-in-progress
direction files awaiting promotion.

Naming convention:
```
candidates/therapeutic-direction-v<major>.<minor>.md
```

Use `--candidate-file` with the CLI or `candidateContent` in the HTTP request to evaluate a
specific candidate.

---

## Known Limitations

- **Experiment E reports** cannot be reconstructed from a `runId` — each run produces a fresh
  report and the per-run data is stored as individual rows in `research_developmental_coverage`.
  Use `GET /api/research/results/:userId` to list recent runs.
- **Experiment B and C** have no promotion path — they are monitoring-only metrics. Operator
  reviews the reports and makes manual decisions.
- **Experiment D promotion** does not auto-apply the direction file. Operator must manually copy
  the candidate file after promotion is recorded.
- **Context window**: Experiments that iterate over many sessions (B, C, D, E) can be slow for
  users with many sessions. The CLI runner prints progress to `stderr`.
- **Single-user app**: `userId` must be a valid UUID from the `user_profiles` table. Use
  `GET /api/sessions` and look at `userId` in any session row to find it, or query the DB:
  `SELECT id FROM user_profiles LIMIT 1;`
