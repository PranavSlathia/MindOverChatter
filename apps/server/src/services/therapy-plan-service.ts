// ── Therapy Plan Service ─────────────────────────────────────────
// Generates and persists the internal, evolving therapy plan —
// Claude's hidden treatment notes for each user. Follows the same
// pattern as formulation-service.ts.
//
// The plan is:
//   - Generated fire-and-forget at session end
//   - Injected into Claude's system prompt at session start
//   - Completely invisible to the user (only goals are surfaced via
//     a separate route built by Forge)

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { memories, sessionSummaries, userFormulations } from "../db/schema/index";
import { therapyPlans } from "../db/schema/therapy-plans.js";
import type { TherapyPlanRow } from "../db/schema/therapy-plans.js";
import { spawnClaudeStreaming } from "../sdk/session-manager.js";
import { env } from "../env.js";
import { getModeInstructions } from "../sdk/mode-blocks.js";
import { TherapyPlanSchema } from "@moc/shared";
import type { TherapyPlan } from "@moc/shared";

// ── Types ───────────────────────────────────────────────────────

export type TherapyPlanTrigger = "session_end" | "assessment_submit" | "manual";

// ── Token budget caps ────────────────────────────────────────────

const MAX_UNEXPLORED_AREAS = 5;
const MAX_THERAPEUTIC_GOALS = 4;
const MAX_WORKING_HYPOTHESES = 4;
const MAX_NATURAL_CALLBACKS = 5;

// ── Public API ──────────────────────────────────────────────────

/**
 * Returns the latest therapy plan for the user, or null if none exists.
 */
export async function getLatestTherapyPlan(userId: string): Promise<TherapyPlanRow | null> {
  const result = await db
    .select()
    .from(therapyPlans)
    .where(eq(therapyPlans.userId, userId))
    .orderBy(desc(therapyPlans.createdAt))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Full pipeline: fetch data → call Claude → parse JSON → persist.
 * Called fire-and-forget from the session-end handler.
 */
export async function generateAndPersistTherapyPlan(
  userId: string,
  trigger: TherapyPlanTrigger,
): Promise<void> {
  console.log(`[therapy-plan-service] Starting therapy plan generation for user ${userId} (trigger: ${trigger})`);

  // ── Fetch all inputs in parallel ────────────────────────────
  const [summaryRows, previousPlan, filteredMemories, formulationRow] = await Promise.all([
    // Latest session-level summary
    db
      .select({
        content: sessionSummaries.content,
        themes: sessionSummaries.themes,
        cognitivePatterns: sessionSummaries.cognitivePatterns,
        actionItems: sessionSummaries.actionItems,
        createdAt: sessionSummaries.createdAt,
      })
      .from(sessionSummaries)
      .where(
        and(
          eq(sessionSummaries.userId, userId),
          eq(sessionSummaries.level, "session"),
        ),
      )
      .orderBy(desc(sessionSummaries.createdAt))
      .limit(1),

    // Previous therapy plan
    getLatestTherapyPlan(userId),

    // Recent active memories — top 30 by confidence, not superseded
    db
      .select({
        content: memories.content,
        memoryType: memories.memoryType,
        confidence: memories.confidence,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          isNull(memories.supersededBy),
        ),
      )
      .orderBy(desc(memories.confidence))
      .limit(30),

    // Latest formulation
    db
      .select({
        snapshot: userFormulations.snapshot,
        dataConfidence: userFormulations.dataConfidence,
      })
      .from(userFormulations)
      .where(eq(userFormulations.userId, userId))
      .orderBy(desc(userFormulations.createdAt))
      .limit(1),
  ]);

  console.log(
    `[therapy-plan-service] Fetched: ${summaryRows.length} summaries, ` +
    `${filteredMemories.length} memories, ` +
    `has previous plan: ${!!previousPlan}, ` +
    `has formulation: ${!!formulationRow[0]}`,
  );

  // ── Build prompt context ─────────────────────────────────────
  const latestSummary = summaryRows[0];
  const latestFormulation = formulationRow[0];
  const prevPlanJson = previousPlan ? JSON.stringify(previousPlan.plan, null, 2) : null;

  const summaryContext = latestSummary
    ? [
        `Content: ${latestSummary.content}`,
        latestSummary.themes?.length ? `Themes: ${latestSummary.themes.join(", ")}` : null,
        latestSummary.cognitivePatterns?.length
          ? `Cognitive patterns: ${latestSummary.cognitivePatterns.join(", ")}`
          : null,
        latestSummary.actionItems?.length
          ? `Action items: ${latestSummary.actionItems.join(", ")}`
          : null,
        `Date: ${latestSummary.createdAt.toISOString()}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "None yet.";

  const memoryContext =
    filteredMemories.length > 0
      ? filteredMemories
          .map((m) => `- [${m.memoryType}, confidence: ${m.confidence}] ${m.content}`)
          .join("\n")
      : "None yet.";

  const formulationContext = latestFormulation
    ? `Data confidence: ${latestFormulation.dataConfidence}\nPresenting theme: ${
        (latestFormulation.snapshot as Record<string, unknown> & { formulation?: { presentingTheme?: string } })
          ?.formulation?.presentingTheme ?? "unknown"
      }`
    : "No formulation available yet.";

  const prompt = `You are an internal clinical supervisor writing evolving therapy plan notes for a wellness companion AI.
Your output is used only by the AI companion — the user never sees this.

${
  prevPlanJson
    ? `You have a PREVIOUS therapy plan to EVOLVE (do not replace wholesale):
${prevPlanJson}

When evolving:
- Progress goals from nascent → building → established ONLY if there is clear evidence in recent session data
- Remove goals or hypotheses no longer relevant
- Add new areas discovered in the most recent session
- Preserve working hypotheses unless contradicted by new evidence`
    : "This is the FIRST therapy plan. Create it from the data below."
}

=== Most Recent Session Summary ===
${summaryContext}

=== User Memories (top 30 by confidence, active only) ===
${memoryContext}

=== Formulation Context ===
${formulationContext}

TASK: Produce a therapy plan as valid JSON matching this exact schema:

{
  "unexplored_areas": [
    {
      "topic": "string — area not yet explored with the user",
      "priority": "high" | "medium" | "low",
      "notes": "string — why this matters clinically",
      "approach": "string — how to weave this in naturally"
    }
  ],
  "therapeutic_goals": [
    {
      "goal": "string — internal clinical description",
      "description": "string — what achieving this looks like",
      "progress": "nascent" | "building" | "established",
      "visible_label": "string — encouraging, non-clinical user-facing label"
    }
  ],
  "working_hypotheses": [
    {
      "hypothesis": "string — internal clinical hypothesis",
      "confidence": 0.0-1.0,
      "evidence": "string — what data supports this",
      "internal_only": true
    }
  ],
  "next_session_focus": "string — max 300 characters, what to prioritize next session",
  "natural_callbacks": [
    {
      "trigger_topic": "string — topic the user might raise",
      "probe_question": "string — natural question to bridge to deeper exploration",
      "priority": "high" | "medium" | "low"
    }
  ],
  "recommended_session_mode": "follow_support" | "assess_map" | "deepen_history" | "challenge_pattern" | "consolidate_close" (optional — choose based on user's current state and what they need most this session),
  "directive_authority": "low" | "medium" | "high" (optional — how directive/leading should the AI be: low for vulnerable/distressed users, high for action-oriented users in a stable state),
  "engagement_notes": "string — max 200 chars, one-sentence note about how to open or calibrate this session" (optional)
}

SESSION STRATEGY GUIDANCE:
- recommended_session_mode: Choose "follow_support" if recent data shows distress/overwhelm; "assess_map" for new or unclear presentations; "deepen_history" if rapport is established and user shows curiosity; "challenge_pattern" if user shows cognitive insight readiness; "consolidate_close" if goals are largely established.
- directive_authority: "low" if user is fragile/crisis-adjacent, "medium" default, "high" if user explicitly wants structured guidance.
- engagement_notes: One sentence max on how to begin or calibrate the next session.

TOKEN BUDGET CONSTRAINTS (enforce strictly):
- unexplored_areas: max ${MAX_UNEXPLORED_AREAS} items
- therapeutic_goals: max ${MAX_THERAPEUTIC_GOALS} items
- working_hypotheses: max ${MAX_WORKING_HYPOTHESES} items
- natural_callbacks: max ${MAX_NATURAL_CALLBACKS} items
- next_session_focus: max 300 characters

SAFETY RULES (NON-NEGOTIABLE):
- working_hypotheses must ALWAYS have internal_only: true
- Do NOT use DSM terminology in any field
- natural_callbacks must be phrased as natural conversation bridges, not clinical probes
- visible_label for each goal must be encouraging and non-clinical (e.g. "Finding steadier ground" not "Reducing depressive episodes")
- If you include trauma-adjacent topics in unexplored_areas, set their priority to "low"

Respond with ONLY valid JSON, no markdown fences, no explanation.`;

  // ── Call Claude ──────────────────────────────────────────────
  let rawResponse: string;
  try {
    console.log(`[therapy-plan-service] Calling Claude to generate therapy plan for user ${userId}`);
    rawResponse = await spawnClaudeStreaming(prompt, () => {}, env.CLAUDE_OPUS_MODEL);
  } catch (err) {
    console.error(`[therapy-plan-service] Claude spawn failed for user ${userId}:`, err);
    return;
  }

  if (!rawResponse.trim()) {
    console.error(`[therapy-plan-service] Claude returned empty response for user ${userId}`);
    return;
  }

  // ── Parse + validate JSON ────────────────────────────────────
  let jsonStr = rawResponse.trim();
  const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch?.[1]) {
    jsonStr = codeFenceMatch[1].trim();
  }

  let newPlan: TherapyPlan;
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    newPlan = TherapyPlanSchema.parse(parsed);
  } catch (err) {
    console.error(`[therapy-plan-service] JSON parse/validation failed for user ${userId}:`, err);
    console.error(`[therapy-plan-service] Raw response (first 500 chars):`, rawResponse.slice(0, 500));
    // Previous plan remains intact — do NOT persist
    return;
  }

  // ── Persist with serialized versioning ───────────────────────
  // pg_advisory_xact_lock serializes concurrent generation for this user.
  // Under READ COMMITTED (Postgres default), two concurrent transactions can
  // both read the same MAX(version) before either commits — even with a
  // subquery inside the INSERT. The advisory lock prevents that by blocking
  // the second transaction until the first commits and releases the lock.
  // The unique constraint on (user_id, version) is a safety-net for any
  // path that bypasses this function.
  await db.transaction(async (tx) => {
    // namespace 2 = therapy_plans (avoids collisions with other advisory locks)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2, hashtext(${userId}))`);

    const [latestVersion] = await tx
      .select({ v: therapyPlans.version })
      .from(therapyPlans)
      .where(eq(therapyPlans.userId, userId))
      .orderBy(desc(therapyPlans.version))
      .limit(1);

    const nextVersion = (latestVersion?.v ?? 0) + 1;

    await tx.insert(therapyPlans).values({
      userId,
      version: nextVersion,
      plan: newPlan,
      triggeredBy: trigger,
    });

    console.log(
      `[therapy-plan-service] Persisted therapy plan v${nextVersion} for user ${userId} (trigger: ${trigger})`,
    );
  });
}

/**
 * Formats a therapy plan as a system prompt injection block.
 * Caps arrays to token budget limits before formatting.
 * Returns the string that gets injected into Claude's context at session start.
 */
export function formatTherapyPlanBlock(plan: TherapyPlan): string {
  // Cap arrays to budget limits
  const hypotheses = plan.working_hypotheses.slice(0, MAX_WORKING_HYPOTHESES);
  const unexplored = plan.unexplored_areas.slice(0, MAX_UNEXPLORED_AREAS);
  const goals = plan.therapeutic_goals.slice(0, MAX_THERAPEUTIC_GOALS);
  const callbacks = plan.natural_callbacks.slice(0, MAX_NATURAL_CALLBACKS);

  const hypothesesBlock =
    hypotheses.length > 0
      ? hypotheses
          .map(
            (h) =>
              `- ${h.hypothesis} (confidence: ${(h.confidence * 100).toFixed(0)}%)\n  Evidence: ${h.evidence}`,
          )
          .join("\n")
      : "None established yet.";

  const unexploredBlock =
    unexplored.length > 0
      ? unexplored
          .map((u) => `- [${u.priority.toUpperCase()}] ${u.topic}\n  Approach: ${u.approach}`)
          .join("\n")
      : "None identified yet.";

  const goalsBlock =
    goals.length > 0
      ? goals
          .map(
            (g) =>
              `- ${g.description} (progress: ${g.progress})\n  "${g.visible_label}"`,
          )
          .join("\n")
      : "No goals established yet.";

  const callbacksBlock =
    callbacks.length > 0
      ? callbacks
          .map(
            (cb) =>
              cb.priority === "high"
                ? `- REQUIRED EXPLORATION: When "${cb.trigger_topic}" comes up, you MUST ask: "${cb.probe_question}". Priority: ${cb.priority}. Do not let the session end without addressing at least one high-priority callback.`
                : `- When "${cb.trigger_topic}" comes up, ask: "${cb.probe_question}" [${cb.priority}]`,
          )
          .join("\n")
      : "No callbacks configured.";

  // Build mode block if present
  let modeBlock = "";
  if (plan.recommended_session_mode) {
    const modeInstructions = getModeInstructions(plan.recommended_session_mode);
    const authorityLine = plan.directive_authority
      ? `\nDIRECTIVE AUTHORITY: ${plan.directive_authority.toUpperCase()} — ${
          plan.directive_authority === "low"
            ? "follow the user's lead, minimize direction"
            : plan.directive_authority === "high"
              ? "be more structured and directive when appropriate"
              : "balance following and guiding"
        }`
      : "";
    const engagementLine = plan.engagement_notes
      ? `\nENGAGEMENT NOTE: ${plan.engagement_notes}`
      : "";
    modeBlock = `CURRENT SESSION MODE: ${plan.recommended_session_mode.toUpperCase()}
DIRECTIVE AUTHORITY: ${(plan.directive_authority ?? "medium").toUpperCase()}
MODE INSTRUCTIONS: ${modeInstructions}${authorityLine}${engagementLine}
CONDITIONAL SHIFTS: If user shows distress → shift to follow_support immediately. If user shows insight/openness → may shift to challenge_pattern.

`;
  }

  return `${modeBlock}=== INTERNAL THERAPY PLAN (Clinical — Do Not Share With User) ===

IMPORTANT: The following is your internal clinical guidance for this session.
Do NOT mention this plan to the user. Do NOT reveal that you have a therapy plan.
Do NOT say "according to my notes" or anything that reveals structured tracking.
Use this to guide what you explore NATURALLY through conversation.

WORKING HYPOTHESES (hold these lightly — never project them onto the user):
${hypothesesBlock}

AREAS TO EXPLORE THIS SESSION:
${plan.next_session_focus}

UNEXPLORED AREAS (weave in organically when relevant, never force):
${unexploredBlock}

GOALS WE'RE WORKING TOWARD:
${goalsBlock}

NATURAL CALLBACKS (when the user raises the trigger topic, bridge to deeper exploration):
High-priority callbacks are OBLIGATIONS — address at least one per session. If the conversation has not naturally reached a high-priority callback by turn 8, create the opening yourself.
${callbacksBlock}

=== END INTERNAL THERAPY PLAN ===`;
}
