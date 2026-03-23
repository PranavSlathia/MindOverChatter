# MindOverChatter Autoresearch Program

## Identity
This is the autoresearch system for MindOverChatter -- an AI therapy quality optimization loop.
It measures therapy conversation quality, generates improvement candidates, evaluates them
against frozen benchmarks, and promotes winners through human review.

## Mutation Surfaces

### Active This Sprint (Quality v1)
| # | File | What It Controls | Evaluator |
|---|------|-----------------|-----------|
| 1 | `.claude/skills/therapeutic-direction.md` | Session steering, directiveness, callbacks, challenge quota | Experiment D (replay) + Experiment G (new sessions) |

### Deferred (no replay-grade evaluator yet)
| # | File | What It Controls | Blocker |
|---|------|-----------------|---------|
| 2 | `.claude/skills/probing-depth.md` | Depth enforcement rules, 3-turn rule | Experiment D only scores therapeutic-direction.md candidates |
| 3 | `apps/server/src/sdk/session-manager.ts` SYSTEM_PROMPT (lines 55-97) | Core identity, MI-OARS approach | Experiment D only scores therapeutic-direction.md candidates |

### Frozen (never mutable via autoresearch)
| File | Reason |
|------|--------|
| `.claude/skills/therapeutic-safety.md` | Crisis protocol -- non-negotiable, requires Vigil |
| Crisis detection pipeline | Zero regression tolerance |
| All other skill files | Not mutation surfaces |

To expand mutation surfaces, first extend Experiment D to support replay-scoring
for the target file, then move it from "Deferred" to "Active."

## Evaluation Stack
Run in order for EVERY candidate. ALL must pass.

1. **Experiment D** (Replay Harness) -- safety audit + quality score (>=70/100) + trajectory review
2. **Experiment G** (CounselBench) -- 6-dimension quality scoring against frozen benchmark
3. **Crisis test suite** -- `pnpm turbo test --filter=@moc/server -- --grep "crisis"` -- zero regressions

## Success Criteria (Current Targets)

| Dimension | Baseline (2026-03-23) | Target | Floor (NEVER below) |
|-----------|----------------------|--------|---------------------|
| overall | 3.97 | >= 4.2 | 3.5 |
| actionability | 2.27 | >= 3.0 | 2.5 |
| safety | 4.12 | >= 4.3 | 4.0 |
| professionalism | 4.32 | >= 4.4 | 4.0 |
| depth | 3.89 | >= 3.8 | 3.5 |
| empathy | 4.36 | >= 4.0 | 3.8 |
| relevance | 4.86 | >= 4.0 | 3.8 |

## Forbidden Regressions
- depth MUST NEVER drop below 3.5
- empathy MUST NEVER drop below 3.8
- crisis detection recall MUST stay at 100%
- "wellness companion" framing MUST never claim therapist status
- Helpline numbers (988, iCall, Vandrevala) MUST remain hard-coded and always available

## The Loop

ONE candidate at a time. Never batch. Attribution requires isolation.

```
 1. Read latest baseline from results.tsv -> identify weakest dimension
 2. Hypothesize which active mutation surface is responsible
 3. Generate ONE candidate targeting that dimension
    -> Save to autoresearch/candidates/{surface}-v{major}.{minor}.md
 4. Run Experiment D: replay-score candidate vs baseline on historical sessions
    -> Must pass all 3 gates (safety, quality >= 70, trajectory)
 5. If D passes: promote candidate to live, have 2-3 real sessions
 6. Run Experiment G on ONLY the new sessions (tag cohort=candidate-vX.Y)
 7. Compare new-session scores against baseline from results.tsv
    -> Check all forbidden regressions
 8. Record keep/discard decision with rationale in results.tsv
 9. If keep: candidate stays promoted, new scores become baseline
    If discard: revert to previous version, investigate
10. Repeat from step 1 with next weakest dimension
```

### Two Evaluation Tracks
- **Track A (scorer stability)**: Rescore frozen-v1 exchanges periodically to verify scorer hasn't drifted
- **Track B (behavior improvement)**: Score new sessions generated after candidate promotion
- NEVER mix baseline cohort with candidate cohort in the same Exp G comparison

## Candidate Naming Convention
```
autoresearch/candidates/therapeutic-direction-v{major}.{minor}.md
autoresearch/candidates/probing-depth-v{major}.{minor}.md
autoresearch/candidates/system-prompt-v{major}.{minor}.md
```

## Branch Strategy
- All research work happens on `research/*` branches
- Promotions are cherry-picked or merged to `main`
- The `autoresearch/` directory is always on `main` (it's documentation + data)
- Experiment code changes go through normal PR flow

## Who Runs This
The Researcher agent (`.claude/agents/researcher.md`) handles all autoresearch tasks.
It is NEVER triggered for normal development work. Only activated when:
- User says "run experiment", "research", "benchmark", "evaluate quality"
- User says "generate candidate", "optimize", "improve scores"
- User says "check results", "run ledger", "autoresearch"
