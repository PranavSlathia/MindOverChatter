// ── Opening Message Service ─────────────────────────────────────────
// Generates the AI's contextual opening message at the start of every
// session. Uses therapy plan, formulation, memory blocks, and session
// gap to produce a warm, unique, directive-authority-aware greeting.
//
// First-ever session: returns a hardcoded welcome (no LLM call).
// Returning user: LLM-generated greeting using full therapeutic context.

import type { TherapyPlan } from "@moc/shared";
import { sanitizeForPrompt } from "../hooks/calibration-safety.js";
import { spawnClaudeStreaming } from "../sdk/session-manager.js";

// ── Types ───────────────────────────────────────────────────────

export interface OpeningMessageContext {
  userId: string;
  isFirstSession: boolean;
  lastSessionEndedAt: Date | null;
  lastSessionSummary: string | null;
  therapyPlan: TherapyPlan | null;
  formulation: {
    presentingTheme?: string;
    activeStates?: Array<{ label?: string; domain?: string }>;
  } | null;
  userName: string | null;
  memoryBlocks: Map<string, string>;
}

// ── Constants ───────────────────────────────────────────────────

const FIRST_SESSION_GREETING =
  "Hey, I'm MindOverChatter \u2014 your wellness companion. " +
  "I'm here to listen, not to fix. What's on your mind?";

// ── Gap Calculation ─────────────────────────────────────────────

type GapCategory = "short" | "medium" | "long";

function categorizeGap(lastEndedAt: Date | null): { category: GapCategory; days: number } {
  if (!lastEndedAt) return { category: "long", days: 999 };
  const diffMs = Date.now() - lastEndedAt.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 1) return { category: "short", days: Math.round(days * 10) / 10 };
  if (days <= 3) return { category: "medium", days: Math.round(days * 10) / 10 };
  return { category: "long", days: Math.round(days * 10) / 10 };
}

function gapLengthInstruction(category: GapCategory): string {
  switch (category) {
    case "short":
      return "1-2 sentences. Light check-in. Keep it brief.";
    case "medium":
      return "2-3 sentences. Reference the last session theme naturally.";
    case "long":
      return "3-4 sentences. Re-establish connection. Show you remember them.";
  }
}

function authorityInstruction(authority: string | undefined): string {
  switch (authority) {
    case "high":
      return "Open with a specific question from the callback below. Be direct and purposeful.";
    case "low":
      return "Create space. Be gentle. No steering. Let them set the pace.";
    default:
      return "Warm reference to something you know about them + an open question.";
  }
}

// ── Prompt Builder ──────────────────────────────────────────────

function buildOpeningPrompt(ctx: OpeningMessageContext): string {
  const { category, days } = categorizeGap(ctx.lastSessionEndedAt);
  const authority = ctx.therapyPlan?.directive_authority ?? "medium";

  const sections: string[] = [];

  sections.push(
    "You are MindOverChatter, a warm wellness companion. You are about to greet a returning user at the start of a new session.",
    "",
    "CONTEXT (use this to inform your greeting, but NEVER reference scores, assessments, or clinical terms):",
    "",
  );

  if (ctx.userName) {
    sections.push(`User name: ${sanitizeForPrompt(ctx.userName)}`);
  }

  sections.push(`Days since last session: ${days}`);

  if (ctx.lastSessionSummary) {
    sections.push(`Last session summary: ${sanitizeForPrompt(ctx.lastSessionSummary)}`);
  }

  // Formulation-derived info
  if (ctx.formulation?.presentingTheme) {
    sections.push(`Presenting theme: ${sanitizeForPrompt(ctx.formulation.presentingTheme)}`);
  }

  // Therapy plan context
  if (ctx.therapyPlan) {
    if (ctx.therapyPlan.next_session_focus) {
      sections.push(`Therapy plan focus: ${sanitizeForPrompt(ctx.therapyPlan.next_session_focus)}`);
    }
    if (ctx.therapyPlan.engagement_notes) {
      sections.push(`Engagement notes: ${sanitizeForPrompt(ctx.therapyPlan.engagement_notes)}`);
    }
    sections.push(`Directive authority: ${authority}`);

    // For high authority, provide a callback question
    if (authority === "high" && ctx.therapyPlan.natural_callbacks.length > 0) {
      const highPriority = ctx.therapyPlan.natural_callbacks.find((cb) => cb.priority === "high");
      const topCallback = highPriority ?? ctx.therapyPlan.natural_callbacks[0];
      if (topCallback) {
        sections.push(`Top callback question: ${sanitizeForPrompt(topCallback.probe_question)}`);
      }
    }
  }

  // Memory blocks — calibration and overview
  const calibration = ctx.memoryBlocks.get("companion/therapeutic_calibration");
  if (calibration) {
    sections.push(`\nTherapeutic calibration notes: ${sanitizeForPrompt(calibration)}`);
  }

  const overview = ctx.memoryBlocks.get("user/overview");
  if (overview) {
    sections.push(`User overview: ${sanitizeForPrompt(overview)}`);
  }

  sections.push("");
  sections.push("RULES:");
  sections.push("- Keep it warm, natural, conversational");
  sections.push(`- LENGTH: ${gapLengthInstruction(category)}`);
  sections.push(`- STYLE: ${authorityInstruction(authority)}`);
  sections.push(
    "- NEVER mention being an AI, scores, assessments, domain names, or clinical terms",
  );
  sections.push('- NEVER say "therapy plan" or "formulation" or "session mode"');
  sections.push('- NEVER say "according to my notes" or anything that reveals structured tracking');
  sections.push("- End with a question that invites the user to respond");
  sections.push("- Adapt your language to match the user (if they speak Hinglish, use Hinglish)");
  sections.push('- Do NOT start with "Welcome back" — vary your openings naturally');
  sections.push("");
  sections.push(
    "Generate ONLY the greeting message. Nothing else. No quotes, no labels, no explanation.",
  );

  return sections.join("\n");
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Generates the AI's opening message for a session.
 *
 * - First-ever session: returns a hardcoded welcome (no LLM call).
 * - Returning user: builds a contextual prompt and calls Claude to
 *   generate a unique, directive-authority-aware greeting.
 *
 * @param ctx - All the context needed to generate the greeting
 * @param onChunk - Optional callback for streaming chunks (for SSE)
 * @returns The complete opening message text
 */
export async function generateOpeningMessage(
  ctx: OpeningMessageContext,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  // First-ever session — hardcoded welcome, no LLM call
  if (ctx.isFirstSession) {
    const greeting = FIRST_SESSION_GREETING;
    if (onChunk) onChunk(greeting);
    return greeting;
  }

  // Build the opening prompt with full therapeutic context
  const prompt = buildOpeningPrompt(ctx);

  console.log(
    `[opening-message] Generating opening for user ${ctx.userId} ` +
      `(gap=${categorizeGap(ctx.lastSessionEndedAt).category}, ` +
      `authority=${ctx.therapyPlan?.directive_authority ?? "medium"}, ` +
      `prompt=${prompt.length} chars)`,
  );

  try {
    const fullResponse = await spawnClaudeStreaming(prompt, onChunk ?? (() => {}));
    const cleaned = fullResponse.trim();

    if (!cleaned) {
      console.warn("[opening-message] Claude returned empty response, using fallback");
      const fallback = ctx.userName
        ? `Hey ${ctx.userName}, good to see you again. How have things been since we last talked?`
        : "Hey, good to see you again. How have things been since we last talked?";
      if (onChunk) onChunk(fallback);
      return fallback;
    }

    return cleaned;
  } catch (err) {
    console.error("[opening-message] Claude spawn failed, using fallback:", err);
    const fallback = ctx.userName
      ? `Hey ${ctx.userName}, good to see you again. How are you doing today?`
      : "Hey, good to see you again. How are you doing today?";
    if (onChunk) onChunk(fallback);
    return fallback;
  }
}

// Exported for testing
export { buildOpeningPrompt, categorizeGap, FIRST_SESSION_GREETING };
