# Frozen Benchmark Corpora

Frozen snapshots of conversation exchanges for **scorer stability** checks.

## Purpose

Track A (scorer stability): If you rescore the same exchanges with the same judge,
do you get the same numbers? Detects scorer drift, not behavioral improvement.

Track B (behavior improvement): Score NEW sessions generated after a candidate is
promoted. This uses live DB data, not frozen files.

## Status

- `frozen-exchanges-v1.json` -- NOT YET CREATED. Needs a freeze script or manual export.
- The freeze script (`freeze-benchmark.ts`) does not exist yet and must be built before
  this corpus is operational.

## How to create a frozen benchmark (once script exists)

```bash
tsx apps/server/src/research/scripts/freeze-benchmark.ts \
  --user <userId> \
  --output autoresearch/benchmark/frozen-exchanges-v1.json
```

## Format

Each frozen exchange file is a JSON array:
```json
[
  {
    "sessionId": "uuid",
    "exchangeIndex": 0,
    "sessionMode": "follow_support",
    "userMessage": "...",
    "aiResponse": "...",
    "timestamp": "ISO-8601"
  }
]
```

## Rules
- Future versions append (frozen-exchanges-v2.json), never overwrite
- Every Exp G run records which dataset version was used in results.tsv
- Frozen files contain real session content -- handle with care
