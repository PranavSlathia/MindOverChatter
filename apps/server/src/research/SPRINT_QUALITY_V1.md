# Sprint: Therapy Quality v1 — Trustworthy Measurement + Actionability Fix

**Date**: 2026-03-23
**Baseline**: overall=3.97, actionability=2.27, safety=4.12, professionalism=4.32, depth=3.89, empathy=4.17, relevance=4.05
**Source**: Codex shadow run, 187 eligible exchanges across 6 sessions
**Duration**: 10 working days

---

## Sprint Goal

Two things in order:
1. Make the research system **trustworthy and self-improving** (autoresearch maturity)
2. Use it to **fix actionability** (2.27 is below even raw LLaMA-70B's 2.9)

---

## Phase 1: Autoresearch Infrastructure (Days 1-3)

### 1a. Create `program.md` — Research Charter

**File**: `apps/server/src/research/program.md`

Defines the rules of the autoresearch loop. Contents:

```markdown
# MindOverChatter Research Program

## Mutation Surfaces (ONLY these files may be changed by autoresearch)
1. `.claude/skills/therapeutic-direction.md` — session steering, directiveness, callbacks
2. `.claude/skills/probing-depth.md` — depth enforcement rules
3. `apps/server/src/sdk/session-manager.ts` SYSTEM_PROMPT (lines 55-97) — core identity + approach

Everything else is frozen infrastructure.

## Evaluation Stack (run in order for every candidate)
1. Experiment D (Replay Harness) — safety audit + quality score + trajectory review
2. Experiment G (CounselBench) — 6-dimension quality scoring
3. Crisis test suite — zero-regression on crisis detection

## Success Criteria
- actionability >= 3.0 (current: 2.27 — CRITICAL)
- safety >= 4.3 (current: 4.12)
- professionalism >= 4.4 (current: 4.32)
- depth >= 3.8 (current: 3.89 — PRESERVE, do not regress)
- empathy >= 4.0 (current: 4.17 — PRESERVE)
- relevance >= 4.0 (current: 4.05 — PRESERVE)
- overall >= 4.2 (current: 3.97)

## Forbidden Regressions
- depth must NEVER drop below 3.8
- empathy must NEVER drop below 4.0
- crisis detection recall must stay at 100%
- "wellness companion" framing must never claim therapist status

## Candidate Naming
candidates/therapeutic-direction-v{major}.{minor}.md
candidates/probing-depth-v{major}.{minor}.md
candidates/system-prompt-v{major}.{minor}.md

## Loop
1. Identify weakest CounselBench dimension from latest Exp G run
2. Hypothesize which mutation surface is responsible
3. Generate candidate with targeted change
4. Run evaluation stack (D + G + crisis tests)
5. Compare candidate scores against current baseline
6. keep/discard decision with rationale
7. If keep: promote (human review required)
8. Update baseline in results.tsv
9. Repeat from step 1
```

### 1b. Create `results.tsv` — Canonical Run Ledger

**File**: `apps/server/src/research/results.tsv`

```tsv
run_id	date	experiment	judge	dataset_version	candidate	overall	empathy	relevance	safety	actionability	depth	professionalism	decision	rationale
baseline-001	2026-03-23	G	codex-shadow	live-v1	none	3.97	4.17	4.05	4.12	2.27	3.89	4.32	baseline	Initial measurement via Codex shadow run
```

Every future run appends a row. This is the single source of truth for quality trajectory.

### 1c. Freeze Benchmark Corpus

**File**: `apps/server/src/research/benchmark/frozen-exchanges-v1.json`

Snapshot the 187 eligible exchanges (user message + AI response + session mode + session ID) from the current 6 sessions into a frozen JSON file. Future Experiment G runs can use `--dataset frozen-v1` to score against the same data, ensuring comparability across changes.

Implementation:
- Add `--dataset frozen-v1 | live` flag to CLI runner
- When `frozen-v1`: load from JSON file instead of querying live DB
- When `live` (default): query live DB as today
- Every Exp G run records which dataset version was used in results.tsv

### 1d. Harden Experiment G

**File**: `apps/server/src/research/experiments/experiment-g-counselbench.ts`

Known issue: Haiku scoring produced 0 results on a full run. Fix:
- Add scorer preflight: verify Haiku can be spawned before processing exchanges
- Add fail-fast threshold: if >50% of exchanges fail scoring, abort with clear error
- Add explicit failure reasons per exchange (timeout, parse error, spawn failure)
- Always persist run-level metadata (session count, exchange count, failures) even on abort
- Log exchange-level errors to research report markdown

---

## Phase 2: Fix Actionability (Days 4-7)

### Root Cause Analysis

The system prompt and skill files are **entirely oriented toward depth and exploration**. There is NO actionability floor anywhere:

| File | What it says | Actionability impact |
|------|-------------|---------------------|
| SYSTEM_PROMPT (session-manager.ts:55-97) | "validation without deepening is not therapy" | Pushes away from concrete advice |
| SYSTEM_PROMPT | "single-topic, single-timeframe conversation is a missed opportunity" | Widens instead of concluding |
| therapeutic-direction.md v2.0 | "default-deepen", "challenge quota" | Always goes deeper, never surfaces |
| probing-depth.md | "must reach deep at least once per session", 3-turn rule | Forces exploration over resolution |

**The system has no equivalent of "understanding without actionability is not therapy."**

### Candidate Changes

#### Candidate 1: System Prompt Actionability Clause

Add to SYSTEM_PROMPT after the challenge clause:

```
## Actionability Floor
Understanding without a next step is incomplete support. By the end of every session
(or every 5+ substantive exchanges), offer at least one concrete, specific thing
the user can try before the next session. This can be:
- A behavioral experiment ("This week, try noticing when X happens and writing down what you feel")
- A reframe to practice ("Next time Y happens, see if you can reframe it as Z")
- A grounding technique ("When you feel overwhelmed, try the 5-4-3-2-1 exercise")
- A reflection prompt ("Before our next session, think about what X meant to you as a child")

The step must be SPECIFIC to what was discussed, not generic. "Try to be kinder to yourself"
is not actionable. "When your inner critic says [specific thing they said], try responding
with [specific reframe from the session]" is.
```

Save as: `candidates/system-prompt-v1.1.md` (diff only — the actionability clause)

#### Candidate 2: therapeutic-direction.md v2.2

Add to therapeutic-direction.md section on deepen-default:

```
## Actionability Checkpoint
After deepening, surface. The cycle is: validate → deepen → surface with a takeaway.
If you have deepened for 3+ consecutive exchanges, your next response MUST include
a concrete suggestion, reframe, or exercise tied to what was explored.
Depth without actionability is intellectual tourism, not therapy.
```

Save as: `candidates/therapeutic-direction-v2.2.md`

#### Candidate 3: probing-depth.md v1.1

Add a balancing principle:

```
## Surface Rule (balances the 3-Turn Depth Rule)
After reaching "deep" level on any topic, you MUST surface with at least one of:
- A specific coping technique connected to the insight
- A behavioral experiment for the user to try
- A reframe they can practice
- A concrete observation they can watch for

Going deep is the work. Surfacing with something usable is the reward.
```

Save as: `candidates/probing-depth-v1.1.md`

### Evaluation Sequence

For each candidate:
1. Apply candidate to the appropriate mutation surface
2. Run Experiment G against frozen-v1 benchmark — wait, this won't work because candidates affect FUTURE responses, not past ones
3. Instead: Run Experiment D (Replay Harness) to score candidate vs baseline on historical sessions
4. Then: Have 2-3 real sessions with the candidate active
5. Then: Run Experiment G on the new sessions to measure actual quality improvement
6. Record in results.tsv

### Realistic Evaluation Path

Since candidates change future behavior (not past responses), the evaluation is:

```
Day 4: Apply all 3 candidates to mutation surfaces
Day 5-6: Have 3-5 real therapy sessions with the updated system
Day 7: Run Experiment G on the new sessions
        Compare new scores against frozen-v1 baseline
        Record in results.tsv
        keep/discard decision
```

---

## Phase 3: Safety + Professionalism Polish (Days 8-9)

After actionability is fixed and measured, address:

### Safety (4.12 → target 4.3)

Likely phrasing issues. Review Experiment G flagged exchanges where safety scored <4. Common patterns:
- AI suggesting specific coping mechanisms without disclaiming
- Not consistently reinforcing "I'm a wellness companion, not a therapist"
- Occasionally giving advice that could be interpreted as medical

Fix: Add to SYSTEM_PROMPT:
```
When suggesting any technique or exercise, always frame it as:
"Some people find it helpful to..." or "You might try..." — never as prescriptive medical advice.
```

### Professionalism (4.32 → target 4.4)

Review flagged exchanges. Likely:
- Occasionally overstepping companion role
- Being too emotionally effusive
- Using therapist-like language ("In our work together...")

Fix: Review and update therapeutic-safety.md framing rules.

---

## Phase 4: Validate + Baseline (Day 10)

1. Run full Experiment G on all sessions (including new ones from Phase 2)
2. Run Experiment D on latest candidates vs baseline
3. Record final scores in results.tsv
4. Compare against baseline and targets:

| Dimension | Baseline | Target | Actual |
|-----------|----------|--------|--------|
| overall | 3.97 | >= 4.2 | ? |
| actionability | 2.27 | >= 3.0 | ? |
| safety | 4.12 | >= 4.3 | ? |
| professionalism | 4.32 | >= 4.4 | ? |
| depth | 3.89 | >= 3.8 | ? |
| empathy | 4.17 | >= 4.0 | ? |
| relevance | 4.05 | >= 4.0 | ? |

5. If targets met: promote candidates, update baseline
6. If targets not met: identify worst dimension, generate new candidate, repeat

---

## Files Created/Modified

### New Files
| File | Purpose |
|------|---------|
| `research/program.md` | Research charter — mutation surfaces, success criteria, forbidden regressions, loop definition |
| `research/results.tsv` | Canonical run ledger — every Exp G run recorded with scores and decisions |
| `research/benchmark/frozen-exchanges-v1.json` | Frozen benchmark corpus — 187 exchanges from baseline sessions |
| `research/candidates/system-prompt-v1.1.md` | Actionability clause for SYSTEM_PROMPT |
| `research/candidates/therapeutic-direction-v2.2.md` | Actionability checkpoint for direction file |
| `research/candidates/probing-depth-v1.1.md` | Surface rule for depth skill |

### Modified Files
| File | Change |
|------|--------|
| `research/experiments/experiment-g-counselbench.ts` | Scorer preflight, fail-fast, failure reasons, run metadata on abort |
| `research/scripts/run-experiment.ts` | `--dataset frozen-v1\|live` flag |
| `sdk/session-manager.ts` SYSTEM_PROMPT | Add actionability floor clause (after evaluation) |
| `.claude/skills/therapeutic-direction.md` | Add actionability checkpoint (after evaluation) |
| `.claude/skills/probing-depth.md` | Add surface rule (after evaluation) |

### Preserved (Not Modified)
| File | Reason |
|------|--------|
| `therapeutic-safety.md` | Crisis protocol — never modified without Vigil |
| `session-supervisor.ts` | Depth enforcement preserved |
| Crisis detection pipeline | No changes — zero regression tolerance |

---

## In Scope
- Autoresearch infrastructure (program.md, results.tsv, frozen benchmark, Exp G hardening)
- Actionability improvements (system prompt, direction, depth skill)
- Safety phrasing cleanup
- Professionalism calibration
- Depth preservation (must NOT regress)

## Out of Scope
- Replacing Claude as the official Experiment G scorer
- Rebuilding the depth system from scratch
- Voice pipeline work
- UI polish
- Multiple judge modes (defer to future sprint)
- New experiments beyond F and G

---

## Autoresearch Maturity Checklist

| Requirement | Status After Sprint |
|-------------|-------------------|
| Research charter (program.md) | DONE |
| Run ledger (results.tsv) | DONE |
| Frozen benchmark corpus | DONE |
| Mutation surfaces defined | DONE (3 files) |
| Evaluation stack defined | DONE (D + G + crisis tests) |
| Forbidden regressions defined | DONE |
| Candidate naming convention | DONE |
| Keep/discard loop | DONE (manual with human review) |
| Scorer preflight + fail-fast | DONE |
| Autonomous candidate generation | PARTIAL (candidates still human-authored) |
| Fully autonomous loop | OUT OF SCOPE (therapy domain requires human review) |
