// ── Multi-Model Validator Orchestrator ───────────────────────────
// Runs multiple AI reviewers in parallel after a response is streamed.
// Always fire-and-forget — never blocks the user response.
//
// Claude Haiku: safety issues (existing validator, always runs)
// Gemini: conversational quality + probing depth (opt-in via GEMINI_ENABLED)
// Codex: therapeutic framework adherence (opt-in via CODEX_ENABLED, every 3rd turn)
//
// Results collected via Promise.allSettled — one reviewer failing
// never affects the others.

import { env } from "../env.js";
import { spawnCliForJson } from "./cli-spawner.js";
import { runResponseValidator } from "./response-validator.js";
import type { SessionMode } from "@moc/shared";

// ── Types ─────────────────────────────────────────────────────────

export interface ReviewerResult {
  reviewer: "claude_haiku" | "gemini" | "codex";
  score: number; // 0-1
  issues: Array<{ type: string; severity: string; excerpt: string }>;
  latencyMs: number;
  failed: boolean;
}

export interface MultiValidationInput {
  sessionId: string;
  response: string;
  userMessage: string;
  activeSkills: string[];
  currentMode: SessionMode | null;
  turnNumber: number;
}

// ── Constants ─────────────────────────────────────────────────────

const GEMINI_TIMEOUT_MS = 10_000;
const CODEX_TIMEOUT_MS = 10_000;

// ── Prompt Builders ───────────────────────────────────────────────

function buildGeminiPrompt(input: MultiValidationInput): string {
  return `You are a conversational quality reviewer for a mental wellness AI companion.
Evaluate whether the AI's response deepened the conversation or merely validated the user's statement.

Session mode: ${input.currentMode ?? "none"}
Active skills: ${input.activeSkills.join(", ") || "none"}

User message:
"""
${input.userMessage.slice(0, 800)}
"""

AI response to evaluate:
"""
${input.response.slice(0, 1500)}
"""

Evaluation criteria:
1. Did the response deepen the conversation (connect to patterns, relationships, history, core beliefs)?
2. Did it avoid surface-level looping (just reflecting/validating without going deeper)?
3. Did it ask a specific follow-up question that opens a new dimension?
4. Did it demonstrate active listening by building on what the user shared?

Output ONLY a JSON object (no explanation, no markdown fences):
{
  "score": 0.0-1.0,
  "issues": [
    {
      "type": "surface_looping"|"missed_deepening"|"generic_response"|"no_follow_up"|"good_deepening",
      "severity": "low"|"medium"|"high",
      "excerpt": "specific text or observation, max 100 chars"
    }
  ]
}

Scoring:
- 1.0: excellent deepening, specific follow-up, connected to patterns
- 0.7-0.9: good engagement, some deepening
- 0.4-0.6: surface-level — reflected but did not deepen
- below 0.4: generic response with no real engagement

issues: empty array [] if the response is good. Only flag real issues.`;
}

function buildCodexPrompt(input: MultiValidationInput): string {
  return `You are a therapeutic framework adherence reviewer for a mental wellness AI companion.
Evaluate whether the AI's response follows MI-OARS principles and reflects the active therapeutic skills.

Session mode: ${input.currentMode ?? "none"}
Active skills: ${input.activeSkills.join(", ") || "none"}

User message:
"""
${input.userMessage.slice(0, 800)}
"""

AI response to evaluate:
"""
${input.response.slice(0, 1500)}
"""

MI-OARS framework:
- Open questions: Non-leading questions that invite exploration
- Affirmations: Recognizing strengths and efforts
- Reflections: Demonstrating understanding by reflecting back meaning
- Summaries: Pulling together themes when appropriate

Evaluation criteria:
1. Does the response use at least one MI-OARS technique appropriately?
2. Is the response consistent with the session mode (e.g., follow_support = validation first)?
3. Are the active skills reflected in the response approach?
4. Does the response avoid being directive or prescriptive too early?

Output ONLY a JSON object (no explanation, no markdown fences):
{
  "score": 0.0-1.0,
  "issues": [
    {
      "type": "missing_mi_oars"|"mode_mismatch"|"skill_not_reflected"|"premature_advice"|"good_technique",
      "severity": "low"|"medium"|"high",
      "excerpt": "specific text or observation, max 100 chars"
    }
  ]
}

Scoring:
- 1.0: excellent MI-OARS usage, mode-appropriate, skills reflected
- 0.7-0.9: good technique, minor improvements possible
- 0.4-0.6: some technique present but inconsistent
- below 0.4: no MI-OARS evident, directive, or mode-inappropriate

issues: empty array [] if the response is good. Only flag real issues.`;
}

// ── Individual Reviewer Runners ───────────────────────────────────

async function runGeminiReviewer(input: MultiValidationInput): Promise<ReviewerResult> {
  const start = Date.now();
  const prompt = buildGeminiPrompt(input);

  const raw = await spawnCliForJson({
    cli: "gemini",
    model: env.GEMINI_MODEL,
    prompt,
    timeoutMs: GEMINI_TIMEOUT_MS,
    label: "gemini-reviewer",
  });

  if (!raw) {
    return {
      reviewer: "gemini",
      score: 0,
      issues: [],
      latencyMs: Date.now() - start,
      failed: true,
    };
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const score = typeof obj.score === "number" ? Math.max(0, Math.min(1, obj.score)) : 0;
    const issues: Array<{ type: string; severity: string; excerpt: string }> = [];

    if (Array.isArray(obj.issues)) {
      for (const item of obj.issues as unknown[]) {
        if (typeof item !== "object" || item === null) continue;
        const issue = item as Record<string, unknown>;
        if (typeof issue.type === "string" && typeof issue.severity === "string") {
          issues.push({
            type: issue.type,
            severity: issue.severity,
            excerpt: typeof issue.excerpt === "string" ? issue.excerpt.slice(0, 150) : "",
          });
        }
      }
    }

    return {
      reviewer: "gemini",
      score,
      issues,
      latencyMs: Date.now() - start,
      failed: false,
    };
  } catch {
    console.warn("[gemini-reviewer] failed to parse output:", raw.slice(0, 200));
    return {
      reviewer: "gemini",
      score: 0,
      issues: [],
      latencyMs: Date.now() - start,
      failed: true,
    };
  }
}

async function runCodexReviewer(input: MultiValidationInput): Promise<ReviewerResult> {
  const start = Date.now();
  const prompt = buildCodexPrompt(input);

  const raw = await spawnCliForJson({
    cli: "codex",
    model: env.CODEX_MODEL,
    prompt,
    timeoutMs: CODEX_TIMEOUT_MS,
    label: "codex-reviewer",
  });

  if (!raw) {
    return {
      reviewer: "codex",
      score: 0,
      issues: [],
      latencyMs: Date.now() - start,
      failed: true,
    };
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const score = typeof obj.score === "number" ? Math.max(0, Math.min(1, obj.score)) : 0;
    const issues: Array<{ type: string; severity: string; excerpt: string }> = [];

    if (Array.isArray(obj.issues)) {
      for (const item of obj.issues as unknown[]) {
        if (typeof item !== "object" || item === null) continue;
        const issue = item as Record<string, unknown>;
        if (typeof issue.type === "string" && typeof issue.severity === "string") {
          issues.push({
            type: issue.type,
            severity: issue.severity,
            excerpt: typeof issue.excerpt === "string" ? issue.excerpt.slice(0, 150) : "",
          });
        }
      }
    }

    return {
      reviewer: "codex",
      score,
      issues,
      latencyMs: Date.now() - start,
      failed: false,
    };
  } catch {
    console.warn("[codex-reviewer] failed to parse output:", raw.slice(0, 200));
    return {
      reviewer: "codex",
      score: 0,
      issues: [],
      latencyMs: Date.now() - start,
      failed: true,
    };
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Run all enabled reviewers in parallel. Always includes Claude Haiku.
 * Gemini and Codex are controlled by env vars (default: disabled).
 *
 * Returns an array of ReviewerResult. Failed reviewers are included
 * with `failed: true` — callers can filter as needed.
 *
 * This function MUST be fire-and-forget — never block the user response.
 */
export async function runMultiModelValidation(
  input: MultiValidationInput,
): Promise<ReviewerResult[]> {
  const promises: Promise<ReviewerResult>[] = [];

  // ── Claude Haiku (always runs) ──────────────────────────────────
  const haikuStart = Date.now();
  promises.push(
    runResponseValidator({
      response: input.response,
      lastThreeTurns: [
        { role: "user", content: input.userMessage },
        { role: "assistant", content: input.response },
      ],
      sessionMode: input.currentMode ?? "follow_support",
      sessionId: input.sessionId,
    }).then((result): ReviewerResult => {
      if (!result) {
        return {
          reviewer: "claude_haiku",
          score: 0,
          issues: [],
          latencyMs: Date.now() - haikuStart,
          failed: true,
        };
      }
      return {
        reviewer: "claude_haiku",
        score: result.score,
        issues: result.issues.map((i) => ({
          type: i.type,
          severity: i.severity,
          excerpt: i.excerpt,
        })),
        latencyMs: Date.now() - haikuStart,
        failed: false,
      };
    }).catch((): ReviewerResult => ({
      reviewer: "claude_haiku",
      score: 0,
      issues: [],
      latencyMs: Date.now() - haikuStart,
      failed: true,
    })),
  );

  // ── Gemini (opt-in, every turn) ─────────────────────────────────
  if (env.GEMINI_ENABLED) {
    promises.push(runGeminiReviewer(input));
  }

  // ── Codex (opt-in, every 3rd turn) ──────────────────────────────
  // Codex runs every 3rd turn (1-based: turn 3, 6, 9...). Never on turn 1.
  if (env.CODEX_ENABLED && input.turnNumber >= 3 && input.turnNumber % 3 === 0) {
    promises.push(runCodexReviewer(input));
  }

  // Run all reviewers in parallel — one failure never affects others
  const settled = await Promise.allSettled(promises);

  const results: ReviewerResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    }
    // Rejected promises are already caught inside each runner,
    // but this is a safety net.
  }

  // Log summary
  const summaryParts = results.map(
    (r) => `${r.reviewer}=${r.failed ? "FAIL" : r.score.toFixed(2)}`,
  );
  console.log(
    `[multi-validator] session=${input.sessionId} turn=${input.turnNumber} [${summaryParts.join(", ")}]`,
  );

  return results;
}
