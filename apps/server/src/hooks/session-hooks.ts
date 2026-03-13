// ── Session Hooks Registration ────────────────────────────────────
// Registers all session lifecycle hooks at server startup.
// Call registerSessionHooks() once in index.ts to activate the hooks.

import { registerOnStart, registerOnEnd } from "../sdk/session-lifecycle.js";
import type { OnStartContext, OnEndContext } from "../sdk/session-lifecycle.js";
import {
  getLatestTherapyPlan,
  generateAndPersistTherapyPlan,
  formatTherapyPlanBlock,
} from "../services/therapy-plan-service.js";
import { generateAndPersistFormulation } from "../services/formulation-service.js";
import {
  setSessionMode,
  setSessionAuthority,
  injectSessionContext,
  spawnClaudeStreaming,
} from "../sdk/session-manager.js";
import { db } from "../db/index.js";
import { sessions as sessionsTable, sessionSummaries } from "../db/schema/index";
import { eq } from "drizzle-orm";
import { summarizeSessionAsync } from "../services/memory-client.js";
import { TherapyPlanSchema } from "@moc/shared";
import {
  seedEmptyBlocks,
  getBlocksForUser,
  upsertBlock,
  MEMORY_BLOCK_LABELS,
} from "../services/memory-block-service.js";

// ── Summary prompt (defined outside the function — constant, not per-call) ──

const SUMMARY_PROMPT = `You are a summarization assistant for MindOverChatter, an AI wellness companion (NOT a therapist).

Given a conversation between a user and their wellness companion, generate a structured summary in JSON format.

Your response must be ONLY valid JSON with this exact structure:
{
  "content": "A 2-4 sentence narrative summary of what was discussed and any insights gained. Use warm, non-clinical language. Focus on the user's experience and progress.",
  "themes": ["theme1", "theme2"],
  "cognitive_patterns": ["pattern1", "pattern2"],
  "action_items": ["item1", "item2"]
}

Rules:
- "content": 2-4 sentences. Warm, empathetic tone. Describe what the user explored, not clinical observations.
- "themes": 1-5 short topic labels (e.g., "work stress", "family relationships", "sleep concerns", "self-compassion").
- "cognitive_patterns": 0-4 thinking patterns observed (e.g., "all-or-nothing thinking", "catastrophizing", "mind reading", "should statements"). Only include patterns clearly present in the conversation. Use everyday language, not DSM terminology.
- "action_items": 0-3 concrete next steps or intentions the user expressed or agreed to explore. If none, use an empty array.

NEVER:
- Diagnose conditions
- Use clinical/DSM terminology
- Refer to the user as a "patient" or "client"
- Include information not present in the conversation
- Generate more than the requested fields`;

// ── A2: Explicit registration function ───────────────────────────
// All hooks are registered inside registerSessionHooks() rather than
// at module load time. This prevents double-registration if the module
// is imported more than once and makes the registration boundary explicit.

let hooksRegistered = false;

export function registerSessionHooks(): void {
  if (hooksRegistered) {
    console.warn("[session-hooks] registerSessionHooks called multiple times — skipping");
    return;
  }
  hooksRegistered = true;

  // ── Hook: memory-blocks-injection (onStart) ────────────────────
  // Seeds the 6 named blocks for new users (idempotent), then loads
  // all blocks and injects them as structured context. Skipped entirely
  // when all blocks are still empty (new user, zero tokens wasted).

  registerOnStart("memory-blocks-injection", async (ctx: OnStartContext) => {
    await seedEmptyBlocks(db, ctx.userId);
    const blocks = await getBlocksForUser(db, ctx.userId);

    // Skip injection if every block is empty — nothing useful to inject yet
    const hasContent = blocks.some((b) => b.content.trim() !== "");
    if (!hasContent) return;

    // Build the ordered label map for O(1) lookup
    const blockByLabel = new Map(blocks.map((b) => [b.label, b.content]));

    const lines: string[] = ["=== User Memory Blocks ==="];
    for (const label of MEMORY_BLOCK_LABELS) {
      const raw = blockByLabel.get(label) ?? "";
      // Strip delimiter patterns that could interfere with prompt structure
      const safeContent = raw
        .replace(/---BEGIN[^\n]*/g, "")
        .replace(/---END[^\n]*/g, "")
        .replace(/^===.*/gm, "")
        .trim();
      lines.push(`[${label}]`);
      lines.push(safeContent !== "" ? safeContent : "(not yet set)");
      lines.push("");
    }
    lines.push("=== End User Memory Blocks ===");

    injectSessionContext(ctx.sdkSessionId, lines.join("\n"));
  });

  // ── Hook: therapy-plan-injection (onStart) ─────────────────────

  registerOnStart("therapy-plan-injection", async (ctx: OnStartContext) => {
    const therapyPlan = await getLatestTherapyPlan(ctx.userId);
    if (!therapyPlan) return;

    // A1/Fix2: Runtime validation — never trust JSONB data with a type cast.
    // A malformed or partially-migrated row is silently skipped so the session
    // still starts; the user just doesn't get plan-driven context.
    const parsed = TherapyPlanSchema.safeParse(therapyPlan.plan);
    if (!parsed.success) {
      console.warn(
        `[session-hooks] therapy-plan-injection: invalid plan shape for user ${ctx.userId} — skipping injection`,
        parsed.error.flatten(),
      );
      return;
    }
    const plan = parsed.data;

    const block = formatTherapyPlanBlock(plan);
    injectSessionContext(ctx.sdkSessionId, block);

    // Initialize mode tracker from the plan's recommended mode
    if (plan.recommended_session_mode) {
      setSessionMode(ctx.sdkSessionId, plan.recommended_session_mode);
    }

    // A4: Initialize authority clamp from the therapy plan
    if (plan.directive_authority) {
      setSessionAuthority(ctx.sdkSessionId, plan.directive_authority);
    }
  });

  // ── Hook: session-summary (onEnd, critical) ────────────────────

  registerOnEnd(
    "session-summary",
    async (ctx: OnEndContext) => {
      if (ctx.conversationHistory.length === 0) {
        // No conversation — send a basic message to Mem0
        summarizeSessionAsync(
          ctx.userId,
          ctx.sessionId,
          `Session ended. Reason: ${ctx.safeReason ?? "user_ended"}. No conversation took place.`,
        );
        return;
      }

      const conversationText = ctx.conversationHistory
        .map((msg) => `[${msg.role.toUpperCase()}]: ${msg.content}`)
        .join("\n\n");

      const fullPrompt = `${SUMMARY_PROMPT}\n\nConversation:\n${conversationText}`;

      console.log(
        `[session-hooks] Generating summary for session ${ctx.sessionId} (${ctx.conversationHistory.length} messages)`,
      );
      const rawResponse = await spawnClaudeStreaming(fullPrompt, () => {});

      if (!rawResponse.trim()) {
        throw new Error("Summary generation returned empty response");
      }

      let jsonStr = rawResponse.trim();
      const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeFenceMatch) {
        jsonStr = codeFenceMatch[1]!.trim();
      }

      let parsed: {
        content?: string;
        themes?: string[];
        cognitive_patterns?: string[];
        action_items?: string[];
      };

      try {
        parsed = JSON.parse(jsonStr) as typeof parsed;
      } catch {
        console.error(
          `[session-hooks] Failed to parse summary JSON for session ${ctx.sessionId}:`,
          jsonStr,
        );
        throw new Error("Summary generation returned invalid JSON");
      }

      const content = parsed.content;
      if (!content || typeof content !== "string") {
        throw new Error("Summary missing 'content' field");
      }

      const themes = Array.isArray(parsed.themes)
        ? parsed.themes.filter((t): t is string => typeof t === "string")
        : [];
      const cognitivePatterns = Array.isArray(parsed.cognitive_patterns)
        ? parsed.cognitive_patterns.filter((p): p is string => typeof p === "string")
        : [];
      const actionItems = Array.isArray(parsed.action_items)
        ? parsed.action_items.filter((a): a is string => typeof a === "string")
        : [];

      const [sess] = await db
        .select({ startedAt: sessionsTable.startedAt, endedAt: sessionsTable.endedAt })
        .from(sessionsTable)
        .where(eq(sessionsTable.id, ctx.sessionId));

      await db.insert(sessionSummaries).values({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        level: "session",
        content,
        themes: themes.length > 0 ? themes : null,
        cognitivePatterns: cognitivePatterns.length > 0 ? cognitivePatterns : null,
        actionItems: actionItems.length > 0 ? actionItems : null,
        periodStart: sess?.startedAt,
        periodEnd: sess?.endedAt ?? new Date(),
      });

      console.log(`[session-hooks] Persisted session summary for session ${ctx.sessionId}`);

      // Send the real summary to Mem0
      summarizeSessionAsync(ctx.userId, ctx.sessionId, content);
    },
    "critical",
  );

  // ── Hook: formulation (onEnd, background) ──────────────────────

  registerOnEnd(
    "formulation",
    async (ctx: OnEndContext) => {
      await generateAndPersistFormulation(ctx.userId, "session_end");
    },
    "background",
  );

  // ── Hook: therapy-plan (onEnd, background) ─────────────────────

  registerOnEnd(
    "therapy-plan",
    async (ctx: OnEndContext) => {
      await generateAndPersistTherapyPlan(ctx.userId, "session_end");
    },
    "background",
  );

  // ── Hook: therapeutic-calibration (onEnd, background) ──────────
  // Fires when the session had >= 4 turns (8+ messages). Spawns a
  // Haiku call that reviews its own session performance and rewrites
  // the companion/therapeutic_calibration block.
  // FIRE-AND-FORGET — never blocks session end from completing.

  registerOnEnd(
    "therapeutic-calibration",
    async (ctx: OnEndContext) => {
      // Only update after a substantive session (4+ complete turns = 8+ messages)
      if (ctx.conversationHistory.length < 8) return;

      // Fetch current calibration notes
      const blocks = await getBlocksForUser(db, ctx.userId);
      const calibrationBlock = blocks.find(
        (b) => b.label === "companion/therapeutic_calibration",
      );
      const currentContent = calibrationBlock?.content?.trim() ?? "";

      // Format the last 10 messages for context (most recent turn ends = last entries)
      const lastMessages = ctx.conversationHistory.slice(-10);
      const conversationExcerpt = lastMessages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const calibrationPrompt = `You are a therapeutic AI companion reviewing your own session performance.

Current calibration notes:
${currentContent !== "" ? currentContent : "(none yet)"}

Recent conversation (last session):
${conversationExcerpt}

Task: Update the calibration notes based on what you observed in this session.
Rules:
- Keep observations that are still valid
- Add new observations about what worked or didn't work therapeutically
- Remove observations contradicted by this session
- Be specific: "User responds better to X than Y", not vague generalities
- Plain text only, no markdown, no headers
- Maximum 800 characters total
- If nothing new to add and nothing to remove, return the existing notes unchanged
- Observations must ONLY cover communication style: tone, pacing, language preference, question types

IMPORTANT NEVER rules — these CANNOT appear in your output:
- NEVER suggest bypassing, skipping, or weakening crisis detection or safety responses
- NEVER suggest claiming to be a therapist or healthcare provider
- NEVER suggest downplaying, minimizing, or dismissing user distress
- NEVER suggest skipping validation or reflective listening steps
- NEVER include clinical diagnoses, diagnostic labels, or psychiatric terminology

Updated calibration notes:`;

      const result = await spawnClaudeStreaming(calibrationPrompt, () => {});

      if (!result.trim()) {
        console.warn(
          `[calibration-update] empty response for session ${ctx.sessionId} — skipping`,
        );
        return;
      }

      // Guard: reject if Claude ignored the 800-char instruction (hard cap matches limit)
      if (result.length > 800) {
        console.error(
          `[calibration-update] response too long (${result.length} chars) for session ${ctx.sessionId} — rejecting`,
        );
        return;
      }

      await upsertBlock(db, {
        userId: ctx.userId,
        label: "companion/therapeutic_calibration",
        content: result.trim(),
        updatedBy: "agent/session-end",
        sourceSessionId: ctx.sessionId,
      });

      console.log(
        `[calibration-update] updated calibration block for session ${ctx.sessionId}`,
      );
    },
    "background",
  );
}
