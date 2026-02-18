# MindOverChatter Development Standard Operating Procedures

## Overview

This document defines the standard development procedures for MindOverChatter, ensuring consistency, quality, and therapeutic safety across all development activities.

---

## 1. Starting a New Feature

1. **Classify** the feature scope (single-domain, multi-domain, full sprint)
2. **Deploy Compass** for multi-domain features to architect the sprint
3. **Create tasks** with dependencies for each engineer
4. **Follow the pipeline**: PLAN → BUILD → GATE → VALIDATE → SHIP

---

## 2. Database Changes (Forge)

1. Edit Drizzle schema in `apps/server/src/db/schema/`
2. Create matching Zod validator in `packages/shared/src/validators/`
3. Run `pnpm db:generate` to create migration SQL
4. Review generated SQL before applying
5. Run `pnpm db:migrate` to apply
6. Verify with `pnpm db:studio`
7. Run `pnpm turbo build` to catch type errors
8. Notify Pixel if route types changed

---

## 3. Backend Route Changes (Forge)

1. Define/update Zod validator in `packages/shared/src/validators/`
2. Create/update Hono route in `apps/server/src/routes/`
3. Use `zValidator()` for request validation
4. **MUST** export route type for Hono RPC inference
5. Run `pnpm turbo build` to verify types
6. Types auto-propagate to frontend via Hono RPC (no codegen needed)

---

## 4. Frontend Changes (Pixel)

1. Use shadcn/ui components (don't reinvent)
2. Use Hono RPC client for API calls (types auto-inferred)
3. Use Zustand for client state (minimal stores)
4. Use calming theme CSS variables (not hardcoded colors)
5. face-api.js: ZERO images leave the browser (JSON scores only)
6. Run `pnpm turbo build --filter=@moc/web` to verify

---

## 5. AI/SDK Changes (Neura)

1. Session lifecycle: create → query (streaming) → end (summarize)
2. Crisis detection: PreToolUse hook, runs on EVERY message
3. Memory extraction: PostToolUse hook
4. Context budget: ~4,000 tokens per session
5. Skills: `.claude/skills/*.md` files
6. Python services: FastAPI + uv, health endpoint required
7. **Any crisis change → Vigil testing MANDATORY**

---

## 6. Code Review (Sentinel)

1. Deployed after any Tier 2 engineer completes work
2. Reviews against the code-review-checklist skill
3. Special attention to therapeutic safety
4. Verdict: APPROVED / CONDITIONAL / REJECTED
5. CONDITIONAL requires specific fixes before shipping

---

## 7. Testing (Vigil)

1. Unit/integration: Vitest
2. E2E: Playwright
3. Crisis detection: exhaustive keyword testing (English + Hinglish)
4. Therapeutic safety: framing, helpline accuracy, response validation
5. **Crisis changes require `/crisis-test` command**

---

## 8. Shipping (/ship)

1. Run quality gates (build, lint, test)
2. Stage specific files (never `git add -A`)
3. Never stage .env files or secrets
4. Commit with conventional format: `type(scope): description`
5. Push to remote

---

## 9. Therapeutic Safety Rules (NON-NEGOTIABLE)

1. Crisis detection on EVERY user message before AI responds
2. Crisis response is HARD-CODED (never AI-generated)
3. App NEVER claims to be a therapist
4. Helpline numbers always correct and available
5. Session flagged on crisis detection
6. "Wellness companion" / "journaling assistant" framing only
7. Hinglish crisis keywords must be included

---

## 10. Agent Pairings (Mandatory)

| When | Must Also Include |
|------|------------------|
| Forge changes schema | Pixel (types may change) |
| Neura changes therapeutic | Vigil (safety validation) |
| Any code written | Sentinel (code review) |
| Crisis detection changes | Vigil (exhaustive testing) |
