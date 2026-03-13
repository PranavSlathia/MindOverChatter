# Research Isolated Sandbox

This directory contains the autoresearch sandbox for offline experimentation and
hypothesis validation against live user data. All computation here is read-only
against live tables; research tables are write-only outputs that never feed back
into the live application stack.

## Invariant Contract (NON-NEGOTIABLE)

The following rules are enforced by convention and code review. Violating any of
them can corrupt live therapy state or leak research scaffolding into the
therapeutic experience.

### Rule 1 — No direct block mutation except promote.ts

Files in `research/` may NEVER import `upsertBlock` from the memory block
service, except `research/promote.ts`. Only the promote step, after human
review of a gate-approved proposal, may write back to live state. All other
research code is strictly read-and-record.

### Rule 2 — No live plan or formulation generation

Files in `research/` may NEVER import `generateAndPersistTherapyPlan` or
`generateAndPersistFormulation`. Research simulations analyze existing plans;
they do not create new ones. Creating live therapy plans or formulations from
research code would pollute versioned plan history and potentially alter Claude's
therapeutic context without a human review step.

### Rule 3 — research_* tables are FK sinks, not sources

`research_*` tables must NEVER be referenced as foreign-key targets by live
tables (`sessions`, `messages`, `memories`, `therapy_plans`, etc.). Research
rows are append-only outputs. If a live table referenced a research table, a
research experiment could inadvertently block live data deletion via FK
constraints.

### Rule 4 — reports/ is gitignored

`research/reports/` is listed in the root `.gitignore`. Reports are generated
from real session content and must never be committed to version control.
The directory is preserved via `.gitkeep` so the path exists at runtime, but
any file written under it will not appear in `git status`.

### Rule 5 — RESEARCH_ENABLED gate

Research routes and background jobs must check `process.env.RESEARCH_ENABLED === 'true'`
before executing. This flag is off by default and must never be set in production
without an explicit operator decision. The purpose is to ensure research workloads
(which can be CPU/DB-intensive) cannot accidentally run in the live therapeutic
session context.

### Rule 6 — Schema barrel isolation

`research/db/schema/index.ts` must NEVER be imported by
`apps/server/src/db/schema/index.ts`. The live Drizzle schema barrel is the
source of truth for the application DB client; importing research tables there
would include them in all relational query builders and ORM-level introspection,
creating unintended join paths and migration surface area.

## Directory Structure

```
research/
├── db/
│   └── schema/
│       ├── research-calibration-proposals.ts   # Table A — calibration gate outcomes
│       ├── research-hypothesis-simulations.ts  # Table B — hypothesis drift analysis
│       ├── research-direction-compliance.ts    # Table C — direction/mode compliance
│       └── index.ts                            # Research-only barrel (never imported by live schema)
├── reports/                                    # Gitignored — generated output files
│   └── .gitkeep
└── README.md                                   # This file
```

## Tables

| Table | Purpose |
|-------|---------|
| `research_calibration_proposals` | Records proposed therapeutic calibration rewrites with gate verdicts (keep/discard/insufficient_data) and outcome scores |
| `research_hypothesis_simulations` | Records hypothesis drift analysis across plans and sessions, with delta statistics |
| `research_direction_compliance` | Records per-session compliance with therapy plan directives and mode alignment |

All three tables carry `experiment_run_id`, `experiment_version`, `ran_at`, and
optional `promoted_at` / `promoted_by` columns to support auditability and the
human-in-the-loop promotion workflow.
