---
description: Run quality gates, commit, and push to GitHub
---

# Ship — Pre-Push Protocol

Runs quality gates, commits, and pushes. **Never push without running `/ship`.**

---

## Phase 1: Quality Gates

Run all quality checks. ALL must pass before committing.

```bash
pnpm turbo build
```

If build fails, STOP and fix errors.

```bash
pnpm turbo lint
```

Report any new warnings. Lint warnings are non-blocking but should be noted.

If the project has tests configured:
```bash
pnpm turbo test
```

---

## Phase 2: Commit and Push

### Step 1: Show status

```bash
git status
git diff --stat
```

Present a summary:
```
Ready to ship:
- [N] files changed
- Quality gates: build ✅ | lint ✅
```

### Step 2: Stage files

Stage all relevant files. Be specific — don't blindly `git add -A`:

```bash
git add [specific changed files]
```

**NEVER stage:** `.env`, `.env.local`, `.env.production`, credentials, secrets.

### Step 3: Commit

Ask the user for a commit message, or draft one based on the changes.

Follow the convention:
```
type(scope): description

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`

### Step 4: Push

```bash
git push origin [current-branch-name]
```

---

## Phase 3: Summary

```
═══════════════════════════════════════════════════════════
SHIP COMPLETE
═══════════════════════════════════════════════════════════
Branch: [branch-name]
Commit: [short-hash] [message]
Quality gates: build ✅ | lint ✅
Pushed to: origin/[branch-name]
═══════════════════════════════════════════════════════════
```

---

## Troubleshooting

### Build fails
Check for TypeScript errors. Run `pnpm turbo build` for detailed output.

### Lint fails
Check for ESLint/Biome errors. May be auto-fixable with `pnpm turbo lint -- --fix`.
