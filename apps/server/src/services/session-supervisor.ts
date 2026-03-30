// ── Session Supervisor ────────────────────────────────────────────
// Haiku-powered supervisor that classifies intent, refines session mode,
// and activates dynamic skills based on the recent conversation.
//
// Runs AFTER crisis detection + regex mode shift, BEFORE streamAiResponse().
// Falls back silently to regex result on failure or low confidence (< 0.6).
// The supervisor is an enhancement, never a hard dependency.

import type { SessionMode } from "@moc/shared";
import { spawnWithGeminiFallback } from "./cli-spawner.js";

// ── Types ─────────────────────────────────────────────────────────

export interface SupervisorInput {
  lastFiveTurns: { role: "user" | "assistant"; content: string }[];
  currentMode: SessionMode | null;
  formulation: {
    presentingTheme?: string;
    activeStates?: { domain: string; label?: string }[];
  } | null;
  availableSkills: string[];
  sessionTurnCount: number;
  hasOriginStory: boolean;
}

export interface SupervisorOutput {
  /** null = keep current mode */
  recommendedMode: SessionMode | null;
  /** skill filenames to inject dynamically this turn */
  activateSkills: string[];
  probingDepth: "surface" | "medium" | "deep";
  /** one-sentence focus hint injected as context block */
  contextFocus: string;
  /** 0-1. If < 0.6 the caller falls back to regex result. */
  confidence: number;
}

// ── Constants ─────────────────────────────────────────────────────

const SUPERVISOR_TIMEOUT_MS = 30_000;

const VALID_MODES = new Set<string | null>([
  "follow_support",
  "assess_map",
  "deepen_history",
  "challenge_pattern",
  "consolidate_close",
  null,
]);

const VALID_DEPTHS = new Set<string>(["surface", "medium", "deep"]);

// ── Prompt Builder ─────────────────────────────────────────────────

function buildSupervisorPrompt(input: SupervisorInput): string {
  const turnsSummary = input.lastFiveTurns
    .slice(-10) // max 5 pairs
    .map((t, i) => `[${t.role.toUpperCase()} ${i}]: ${t.content.slice(0, 300)}`)
    .join("\n");

  const formulationSummary = input.formulation
    ? [
        input.formulation.presentingTheme ? `Theme: ${input.formulation.presentingTheme}` : null,
        input.formulation.activeStates?.length
          ? `Active patterns: ${input.formulation.activeStates.map((s) => `${s.domain}${s.label ? ` (${s.label})` : ""}`).join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n") || "None"
    : "None";

  return `You are a clinical session supervisor for a mental wellness AI companion. Analyze the conversation and output supervision guidance.

Current session mode: ${input.currentMode ?? "none"}
Session turn count: ${input.sessionTurnCount}
Formulation context: ${formulationSummary}
Available skills: ${input.availableSkills.join(", ")}
Has origin story: ${input.hasOriginStory}

Recent conversation:
${turnsSummary || "(no prior turns)"}

Output ONLY a JSON object (no explanation, no markdown fences):
{
  "recommendedMode": "follow_support"|"assess_map"|"deepen_history"|"challenge_pattern"|"consolidate_close"|null,
  "activateSkills": [],
  "probingDepth": "surface"|"medium"|"deep",
  "contextFocus": "one specific sentence about what to focus on this turn",
  "confidence": 0.0-1.0
}

Mode rules:
- follow_support: user is distressed, overwhelmed, needs validation — ALWAYS wins over other modes
- challenge_pattern: user shows insight, ready to examine patterns — only when NOT distressed
- assess_map: early session or new topic needs understanding
- deepen_history: exploring roots, history, patterns when user is ready
- consolidate_close: user feels resolved, wrapping up
- null: keep current mode (no change needed)

Skill activation (only activate when strongly indicated, use exact filenames from availableSkills):
- probing-grief.md: grief, loss, death, bereavement mentioned directly
- probing-depression.md: persistent sadness, low energy, hopelessness, anhedonia
- probing-anxiety.md: worry, panic, racing thoughts, chronic fear
- probing-relationship.md: relationship conflict, family tension, partner issues
- probing-panic.md: panic attacks, physical anxiety symptoms
- probing-development.md: childhood, growing up, family of origin, formative experiences
- probing-longitudinal.md: recurring cross-session patterns, "this always happens to me"

probingDepth rules:
- surface: first 1-3 turns on this topic, or topic just introduced
- medium: topic mentioned 2+ times, or 4-7 turns in
- deep: 8+ turns or this is the primary presenting concern

DEPTH ALERT DETECTION (critical — prevents surface-level looping):
Analyze the recent conversation for surface-level looping. Surface-level means: the assistant is reflecting/validating but NOT connecting the topic to history, patterns, relationships, core beliefs, or formative experiences.
Signs of surface-level looping:
- Assistant responds with variations of "that sounds hard" / "I hear you" / "how does that make you feel?" without deepening
- The same topic is discussed for 3+ user turns without connecting to when it started, who else is involved, or what it means about the user
- User shares factual events (mundane daily life, what happened at work, what they watched) and assistant stays at the event level without asking what it represents
If you detect surface-level looping for 3+ turns on the same topic, set contextFocus to a DEPTH ALERT directive like:
"DEPTH ALERT: The conversation has stayed surface-level on [topic] for [N] turns. Your next response MUST connect this to either (a) when this pattern started, (b) a relationship dynamic, (c) what it reveals about the user's core belief about themselves, or (d) a memory contradiction."

contextFocus: be specific (e.g. "User is describing grief about father — explore impact on daily life and sense of identity"). When depth alert is warranted, prefix with "DEPTH ALERT:" so the companion treats it as a priority directive.

confidence: 0.9+ = very clear signal, 0.6-0.9 = moderate confidence, below 0.6 = uncertain (fallback to regex)`;
}

// ── Haiku Spawner (delegates to shared CLI spawner) ───────────────

function spawnHaikuJson(prompt: string, timeoutMs: number): Promise<string | null> {
  return spawnWithGeminiFallback({
    prompt,
    timeoutMs,
    label: "session-supervisor",
  });
}

// ── Output Parser ──────────────────────────────────────────────────

function parseSupervisorOutput(raw: string): SupervisorOutput | null {
  // Extract JSON object — Claude may wrap it in markdown or add preamble
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const recommendedMode = VALID_MODES.has(obj.recommendedMode as string | null)
      ? (obj.recommendedMode as SessionMode | null)
      : null;

    const activateSkills = Array.isArray(obj.activateSkills)
      ? (obj.activateSkills as unknown[]).filter((s): s is string => typeof s === "string")
      : [];

    const probingDepth = VALID_DEPTHS.has(obj.probingDepth as string)
      ? (obj.probingDepth as "surface" | "medium" | "deep")
      : "surface";

    const contextFocus = typeof obj.contextFocus === "string" ? obj.contextFocus.slice(0, 500) : "";

    const confidence =
      typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0;

    return { recommendedMode, activateSkills, probingDepth, contextFocus, confidence };
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Run the Session Supervisor — a Haiku LLM call that classifies intent,
 * refines the session mode, and identifies skills to activate dynamically.
 *
 * Returns null on failure or if confidence < threshold.
 * Callers should fall back to the existing regex mode detection.
 */
export async function runSessionSupervisor(
  input: SupervisorInput,
): Promise<SupervisorOutput | null> {
  const prompt = buildSupervisorPrompt(input);

  console.log(
    `[session-supervisor] running (turns=${input.sessionTurnCount}, mode=${input.currentMode ?? "none"})`,
  );

  const raw = await spawnHaikuJson(prompt, SUPERVISOR_TIMEOUT_MS);
  if (!raw) {
    console.warn("[session-supervisor] Haiku returned no output — falling back to regex");
    return null;
  }

  const output = parseSupervisorOutput(raw);
  if (!output) {
    console.warn("[session-supervisor] failed to parse output:", raw.slice(0, 300));
    return null;
  }

  console.log(
    `[session-supervisor] mode=${output.recommendedMode ?? "keep"} skills=[${output.activateSkills.join(",")}] depth=${output.probingDepth} confidence=${output.confidence.toFixed(2)}`,
  );

  return output;
}
