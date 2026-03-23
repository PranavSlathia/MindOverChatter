# MindOverChatter Autoresearch

Autonomous therapy quality optimization system. Measures conversation quality,
generates improvement candidates, evaluates against frozen benchmarks, and promotes
winners through human review.

## Quick Start

```bash
# Run CounselBench evaluation
tsx apps/server/src/research/scripts/run-experiment.ts --experiment g --user <userId>

# Run replay harness with candidate
tsx apps/server/src/research/scripts/run-experiment.ts --experiment d --user <userId> \
  --candidate-file autoresearch/candidates/therapeutic-direction-v2.2.md

# Run all experiments
tsx apps/server/src/research/scripts/run-experiment.ts --experiment all --user <userId>

# Check results
cat autoresearch/results.tsv
```

## Architecture

```
autoresearch/              <- Research brain (data + docs)
|-- program.md             <- Research charter (mutation surfaces, criteria, loop)
|-- results.tsv            <- Run ledger (every experiment recorded)
|-- benchmark/             <- Frozen test corpora
|-- candidates/            <- Mutation candidates
|-- reports/               <- Generated reports (gitignored)
+-- README.md              <- This file

apps/server/src/research/  <- Experiment code (needs server imports)
|-- experiments/           <- A-G experiment implementations
|-- db/schema/             <- Research-only DB tables
|-- lib/                   <- Shared utilities (promote, reporter, queries)
|-- scripts/               <- CLI runner
+-- routes/                <- HTTP routes (RESEARCH_ENABLED gate)
```

## Key Principles
- Research reads live data but NEVER writes to live tables (except promote.ts)
- All writes go to `research_*` tables
- Human review required before any promotion
- Frozen benchmarks ensure reproducible comparisons
- Every run is logged in results.tsv
