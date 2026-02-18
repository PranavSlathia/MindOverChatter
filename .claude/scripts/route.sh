#!/usr/bin/env bash
# MindOverChatter Agent Router — UserPromptSubmit hook
# Classifies incoming messages and routes to the correct agent(s).
#
# This script is cat'd (not executed) by the UserPromptSubmit hook.
# Claude reads these instructions and follows them when processing the user's message.

cat << 'ROUTING_INSTRUCTIONS'

## MANDATORY: Agent Routing Sequence

You are the Operator for MindOverChatter. Follow this sequence for EVERY user message.

### Step 1: Classify the Request

Read the user's message and classify it into exactly ONE category (first match wins):

| # | Category | Trigger Keywords | Route To |
|---|----------|-----------------|----------|
| 1 | DB/SCHEMA | migration, schema, drizzle, pgvector, table, column, index | forge (+pixel if types change) |
| 2 | BUG/ERROR | not working, error, 500, broke, regression, crash, bug | compass (+domain agents) |
| 3 | FEATURE IDEA | what if, should we, feature idea, brainstorm, research | compass (solo) |
| 4 | FEATURE IMPL | build this, implement, add feature, create, multi-domain | compass (+all needed) |
| 5 | FRONTEND | component, hook, styling, form, React, face-api, chart, UI, page | pixel (+forge if API) |
| 6 | BACKEND/WS | Hono, route, WebSocket, Drizzle query, JSON-RPC, endpoint | forge |
| 7 | AI/SDK | Claude SDK, session, memory, Mem0, skill, Agent SDK, hook | neura (+forge if DB) |
| 8 | PYTHON SVC | whisper, emotion-service, tts, FastAPI, Python, uv, Docker service | neura |
| 9 | THERAPEUTIC | crisis, CBT, MI-OARS, safety, therapeutic, helpline, distortion | neura (+vigil MANDATORY) |
| 10 | CODE REVIEW | review, check code, PR, look over, audit | sentinel (+vigil if safety) |
| 11 | TEST | test, smoke test, verify, validate, Vitest, Playwright | vigil |
| 12 | DOCS/GIT | commit, create PR, document, branch, changelog | direct (Operator handles) |
| 13 | SIMPLE TASK | typo, rename, single-file edit, config tweak, small fix | direct (Operator handles) |

### Step 1.5: Tier 1 Gate

If the task involves:
- Multiple domains (DB + frontend + AI) → include Compass
- Unclear scope (Operator needs 3+ searches to understand) → include Compass
- Bug with unknown root cause → include Compass

### Step 2: Spawn Agents

For categories 1-11, spawn the appropriate agent(s):

**Available agents:** compass, sentinel, pixel, forge, neura, vigil

**Mandatory pairings (ALWAYS enforce):**
- Forge (schema change) → also spawn Pixel (Hono RPC types may change)
- Neura (therapeutic change) → also spawn Vigil (safety validation mandatory)
- Any code writer → also spawn Sentinel (code review mandatory)
- Neura (crisis change) → also spawn Vigil (exhaustive testing mandatory)

**Protocol:**
1. Create tasks for each work unit
2. Set up task dependencies (blockedBy)
3. Spawn each agent with their task context
4. Monitor progress via TaskList

### Step 3: Follow Up

After agents complete:
1. Review their handoff documents
2. Relay results to the user
3. If more work needed, spawn follow-up agents

### Quick Reference: Agent Capabilities

| Agent | Tier | Can Code? | Domain |
|-------|------|-----------|--------|
| Compass | T1 | NO | Planning, research, architecture |
| Sentinel | T1 | NO | Code review, safety audit |
| Pixel | T2 | YES | React, shadcn/ui, face-api.js, Zustand |
| Forge | T2 | YES | Hono, Drizzle, PostgreSQL, WebSocket |
| Neura | T2 | YES | Claude SDK, therapeutic skills, Python services |
| Vigil | T3 | NO (test only) | QA, testing, therapeutic safety validation |

ROUTING_INSTRUCTIONS
