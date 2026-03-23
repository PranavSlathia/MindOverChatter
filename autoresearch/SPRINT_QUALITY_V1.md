# Sprint: Therapy Quality v1 — Trustworthy Measurement + Actionability Fix

**Date**: 2026-03-23
**Baseline**: overall=3.97, empathy=4.36, relevance=4.86, safety=4.12, actionability=2.27, depth=3.89, professionalism=4.32
**Source**: Codex shadow run (`codex_experiment_g_full_summary.json`), 187 eligible exchanges across 6 sessions
**Duration**: 10 working days

---

## Sprint Goal

Two things in order:
1. Make the research system **trustworthy and self-improving** (autoresearch maturity)
2. Use it to **fix actionability** (2.27 is below even raw LLaMA-70B's 2.9)

---

## Corrections Log

Issues identified in v0 of this doc and fixed in this version:

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| P1 | Baseline numbers wrong | empathy was 4.17, relevance was 4.05 — actual Codex values are 4.36 and 4.86 | Corrected to match `codex_experiment_g_full_summary.json` |
| P1 | Evaluation stack can't validate 2 of 3 mutation surfaces | Experiment D only evaluates therapeutic-direction.md, not system prompt or probing-depth | Shrink mutation surface to 1 file this sprint (therapeutic-direction.md only) |
| P1 | 3 candidates applied simultaneously destroys attribution | "Apply all 3 candidates" means you can't tell which one helped | Test ONE candidate at a time, measure, keep/discard, then next |
| P2 | Frozen benchmark doesn't measure behavioral improvement | Frozen user+assistant pairs can't show if new prompts produce better responses | Split into two evaluation tracks: scorer-stability (frozen pairs) and behavior-improvement (new sessions) |
| P2 | Final validation mixes cohorts | Running Exp G on "all sessions including new ones" changes dataset composition | Evaluate new-session cohort separately, compare against baseline cohort |
| P3 | Phase 3 contradicts mutation rules | Plan says update therapeutic-safety.md but also says it's preserved/frozen | therapeutic-safety.md is OUT OF SCOPE this sprint. Safety improvements go through therapeutic-direction.md only |

---

## Phase 1: Autoresearch Infrastructure (Days 1-3)

### 1a. `program.md` — Research Charter

**File**: `autoresearch/program.md` (ALREADY CREATED)

Key correction: **This sprint restricts mutation to ONE surface only.**

```
## Mutation Surface (this sprint)
1. `.claude/skills/therapeutic-direction.md` — ONLY mutable file

## Why only one
- Experiment D can only replay-score therapeutic-direction.md candidates
- System prompt and probing-depth.md have no replay-grade evaluator yet
- Single-surface testing preserves attribution (you know what caused score changes)

## Future sprints may expand to:
2. `.claude/skills/probing-depth.md` (needs Experiment D extension first)
3. `apps/server/src/sdk/session-manager.ts` SYSTEM_PROMPT (needs Experiment D extension first)
```

Update `autoresearch/program.md` with this restriction.

### 1b. `results.tsv` — Corrected Baseline

**File**: `autoresearch/results.tsv` (ALREADY CREATED — needs number fix)

```tsv
run_id	date	experiment	judge	dataset_version	candidate	overall	empathy	relevance	safety	actionability	depth	professionalism	decision	rationale
baseline-001	2026-03-23	G	codex-shadow	live-187	none	3.97	4.36	4.86	4.12	2.27	3.89	4.32	baseline	Initial measurement: 187 eligible exchanges, 6 sessions. Source: codex_experiment_g_full_summary.json
```

### 1c. Frozen Benchmark — Two-Track Design

**Track A: Scorer Stability (frozen user+assistant pairs)**
- File: `autoresearch/benchmark/frozen-exchanges-v1.json`
- Content: 187 exchanges exactly as they happened (user message + AI response + session mode)
- Purpose: If you rescore the same exchanges with the same judge, do you get the same numbers? Detects scorer drift, not behavioral improvement.
- Use: Run Exp G with `--dataset frozen-v1` periodically to verify scorer hasn't drifted

**Track B: Behavior Improvement (new sessions after candidate promotion)**
- No frozen file — these are live sessions generated AFTER a candidate is applied
- Purpose: Did the candidate actually make the AI respond better?
- Use: Apply candidate → have 2-3 sessions → run Exp G on ONLY those new sessions → compare against baseline
- Critical: NEVER mix baseline cohort (6 sessions) with new-candidate cohort when comparing

### 1d. Harden Experiment G

**File**: `apps/server/src/research/experiments/experiment-g-counselbench.ts`

- Scorer preflight: verify Haiku/Claude can be spawned before processing any exchanges
- Fail-fast: if >50% of exchanges fail scoring, abort with clear error message
- Per-exchange failure reasons: timeout, parse error, spawn failure, invalid JSON
- Always persist run metadata (session count, exchange count, success count, failure count) even on abort
- Add `--cohort baseline|candidate-<name>` flag to tag which cohort a run evaluates

---

## Phase 2: Fix Actionability (Days 4-8)

### Root Cause (Unchanged)

The system has no actionability floor. Everything pushes toward depth and exploration.

| Source | What it says | Actionability impact |
|--------|-------------|---------------------|
| SYSTEM_PROMPT | "validation without deepening is not therapy" | Pushes away from concrete advice |
| SYSTEM_PROMPT | "single-topic, single-timeframe is a missed opportunity" | Widens instead of concluding |
| therapeutic-direction.md v2.0 | "default-deepen", "challenge quota" | Always deeper, never surfaces |
| probing-depth.md | "must reach deep at least once per session" | Forces exploration over resolution |

### Single-Surface, Sequential Candidate Testing

**This sprint mutates ONLY `therapeutic-direction.md`.** One candidate at a time.

#### Candidate A: therapeutic-direction-v2.2.md (Actionability Checkpoint)

Add a new section to therapeutic-direction.md:

```
## Actionability Checkpoint
After deepening, surface. The cycle is: validate → deepen → surface with a takeaway.
If you have deepened for 3+ consecutive exchanges, your next response MUST include
a concrete suggestion, reframe, or exercise tied to what was explored.

The takeaway must be SPECIFIC to what was discussed, not generic.
"Try to be kinder to yourself" is not actionable.
"When your inner critic says [specific thing from session], try responding with
[specific reframe developed in session]" is.

Depth without actionability is intellectual tourism, not therapy.
```

**Evaluation sequence for Candidate A:**
```
Day 4:
  1. Save candidate as autoresearch/candidates/therapeutic-direction-v2.2.md
  2. Run Experiment D: baseline (v2.0) vs candidate (v2.2) on historical sessions
     → Gate 1 (safety): must pass
     → Gate 2 (quality): candidate_mean >= 70 AND >= baseline_mean - 2.0
  3. Record D results in results.tsv
  4. If D passes gate: promote v2.2 to live, have 2-3 real sessions

Day 5-6:
  5. Have 2-3 real therapy sessions with v2.2 active
  6. Run Experiment G on ONLY the new sessions (tag: cohort=candidate-v2.2)
  7. Compare actionability score against baseline 2.27
  8. Record G results in results.tsv
  9. Keep/discard decision:
     - KEEP if: actionability improved AND depth >= 3.5 AND empathy >= 3.8
     - DISCARD if: any forbidden regression triggered
```

#### Candidate B: therapeutic-direction-v2.3.md (Safety Phrasing)

Only attempted AFTER Candidate A is resolved (kept or discarded).

Add to therapeutic-direction.md:

```
## Companion Framing Reminder
When offering any technique, exercise, or suggestion:
- Frame as invitation: "Some people find it helpful to..." or "You might try..."
- Never prescriptive: "You should..." or "You need to..."
- Reinforce role: "As your wellness companion, I can share..."
- Never claim expertise: "In my clinical experience..." (FORBIDDEN)
```

**Evaluation: same sequence as Candidate A.** D first, then live sessions, then G.

#### Candidate C: therapeutic-direction-v2.4.md (Professionalism Tightening)

Only attempted AFTER Candidate B is resolved.

Tighten the companion framing language. Specific changes TBD based on Exp G flagged exchanges from earlier candidates.

### Why Not System Prompt or probing-depth.md?

Experiment D can only replay-score `therapeutic-direction.md` candidates. To test system prompt or probing-depth changes, we'd need to either:
1. Extend Experiment D to support those mutation surfaces (future sprint)
2. Rely solely on new-session Exp G scoring (weaker — no replay comparison)

This sprint chooses rigor over breadth. One surface we can properly evaluate > three surfaces we can't.

---

## Phase 3: Validate + New Baseline (Days 9-10)

### Scorer Stability Check
Run Exp G with `--dataset frozen-v1` to verify scorer hasn't drifted from baseline numbers.

### Final Cohort Comparison

Two separate Exp G runs:
1. **Baseline cohort**: The original 6 sessions (or frozen-v1 equivalent)
2. **Post-candidate cohort**: All sessions created after candidate promotions

Compare dimensions:

| Dimension | Baseline (6 sessions) | Target | Post-Candidate (new sessions) |
|-----------|----------------------|--------|-------------------------------|
| overall | 3.97 | >= 4.2 | ? |
| actionability | 2.27 | >= 3.0 | ? |
| safety | 4.12 | >= 4.3 | ? |
| professionalism | 4.32 | >= 4.4 | ? |
| depth | 3.89 | >= 3.8 | ? |
| empathy | 4.36 | >= 4.0 | ? |
| relevance | 4.86 | >= 4.0 | ? |

### Decision
- If targets met across post-candidate cohort: sprint succeeds, update baseline in results.tsv
- If targets partially met: identify remaining weak dimension, plan next sprint
- If regressions: revert last candidate, investigate

---

## Files

### New This Sprint
| File | Purpose |
|------|---------|
| `autoresearch/candidates/therapeutic-direction-v2.2.md` | Candidate A: actionability checkpoint |
| `autoresearch/candidates/therapeutic-direction-v2.3.md` | Candidate B: safety phrasing (after A resolves) |
| `autoresearch/candidates/therapeutic-direction-v2.4.md` | Candidate C: professionalism (after B resolves) |
| `autoresearch/benchmark/frozen-exchanges-v1.json` | Frozen 187 exchanges for scorer stability |

### Modified This Sprint
| File | Change |
|------|--------|
| `autoresearch/program.md` | Restrict mutation to 1 surface this sprint |
| `autoresearch/results.tsv` | Fix baseline numbers, append all run results |
| `experiment-g-counselbench.ts` | Scorer preflight, fail-fast, cohort tagging |
| `run-experiment.ts` | `--dataset` and `--cohort` flags |
| `.claude/skills/therapeutic-direction.md` | Promoted candidates (after evaluation) |

### NOT Modified This Sprint
| File | Reason |
|------|--------|
| `.claude/skills/therapeutic-safety.md` | Out of scope — non-negotiable, no mutation |
| `.claude/skills/probing-depth.md` | No replay-grade evaluator — defer to future sprint |
| `session-manager.ts` SYSTEM_PROMPT | No replay-grade evaluator — defer to future sprint |
| `session-supervisor.ts` | Depth enforcement preserved as-is |
| Crisis detection pipeline | Zero regression tolerance |

---

## In Scope
- Autoresearch infrastructure (corrected program.md, results.tsv, frozen benchmark, Exp G hardening)
- Actionability improvement via therapeutic-direction.md candidates (sequential, one at a time)
- Safety phrasing via therapeutic-direction.md (not therapeutic-safety.md)
- Professionalism via therapeutic-direction.md
- Scorer stability verification
- Cohort-separated evaluation

## Out of Scope
- Mutations to probing-depth.md (no evaluator)
- Mutations to SYSTEM_PROMPT (no evaluator)
- Mutations to therapeutic-safety.md (non-negotiable)
- Multiple judge modes
- Rebuilding depth system
- Voice pipeline
- UI polish

---

## Autoresearch Maturity After This Sprint

| Requirement | Status |
|-------------|--------|
| Research charter (program.md) | DONE |
| Corrected run ledger (results.tsv) | DONE |
| Frozen benchmark for scorer stability | DONE |
| Cohort-separated evaluation | DONE |
| Single mutation surface with attribution | DONE |
| Sequential candidate testing | DONE |
| Experiment D as replay gate | DONE (therapeutic-direction.md only) |
| Experiment G as quality gate | DONE (with preflight + fail-fast) |
| Keep/discard loop with rationale | DONE |
| Human review before promotion | DONE |
| Multi-surface evaluation (D for system prompt + probing-depth) | FUTURE SPRINT |
| Autonomous candidate generation | FUTURE SPRINT |
