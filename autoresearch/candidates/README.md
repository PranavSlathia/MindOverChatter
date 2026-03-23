# Autoresearch Candidates

Candidate versions of mutation surfaces awaiting evaluation.

## Naming Convention
- `therapeutic-direction-v{major}.{minor}.md`
- `probing-depth-v{major}.{minor}.md`
- `system-prompt-v{major}.{minor}.md`

## Workflow
1. Create candidate here
2. Run evaluation stack: `tsx apps/server/src/research/scripts/run-experiment.ts --experiment d --candidate-file autoresearch/candidates/<file>`
3. Record result in `autoresearch/results.tsv`
4. If keep: promote to live location (human review required)
