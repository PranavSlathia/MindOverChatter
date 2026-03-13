// ── Calibration prompt safety utilities ───────────────────────────
// Pure functions with no imports — safe to use in both the hook
// and unit tests without pulling in the DB import chain.

// ── Prompt sanitizer ──────────────────────────────────────────────
// Strips delimiter patterns that could interfere with prompt structure
// and defends against injection via user-authored or AI-generated text
// interpolated into prompts.

export function sanitizeForPrompt(text: string): string {
  return text
    .replace(/---BEGIN[^\n]*/g, "")
    .replace(/---END[^\n]*/g, "")
    .replace(/^===.*/gm, "")
    .trim();
}

// ── Calibration safety blocklist ──────────────────────────────────
// Runtime defense-in-depth layer. Prompt NEVER clauses are the first
// line of defense; this blocklist is the runtime gate that prevents
// unsafe content from ever reaching the DB regardless of LLM output.

const CALIBRATION_BLOCKLIST: RegExp[] = [
  // Safety bypass directives
  /bypass.*crisis/i,
  /skip.*crisis/i,
  /ignore.*crisis/i,
  /disable.*safety/i,
  // Therapist / medical identity claims
  /\btherapist\b/i,
  /\bpsychiatrist\b/i,
  /\bcounselor\b/i,
  /\bmedical professional\b/i,
  // Diagnostic / clinical terms (specific enough to avoid false positives)
  /\bdiagnos/i,                           // diagnose, diagnosis, diagnostic
  /\bDSM\b/,
  /\bpersonality disorder\b/i,
  /\bbipolar\b/i,
  /\bschizophreni/i,
  /\bnarcissist\b/i,
  // Crisis-adjacent content (should never appear in style calibration)
  /\bsuicid/i,
  /\bself[-\s]harm\b/i,
  // Medical advice
  /\bmedication\b/i,
  /\bprescri/i,                           // prescribe, prescription
];

export function isSafeCalibration(text: string): boolean {
  return !CALIBRATION_BLOCKLIST.some((pattern) => pattern.test(text));
}

// ── User memory block safety blocklist ────────────────────────────
// Guards the five user/* blocks (overview, goals, triggers, coping_strategies,
// relationships). These blocks are injected into every session start context,
// so any unsafe content becomes persistent prompt state.
//
// Two threat classes:
//   1. Prompt injection — crafted user messages that became memories and could
//      alter Claude's behaviour when re-injected at session start.
//   2. Clinical labels — DSM diagnostic terms should NEVER be stored as profile
//      facts; the app is a wellness companion, not a diagnostic tool.

const USER_BLOCK_BLOCKLIST: RegExp[] = [
  // ── Prompt injection patterns ────────────────────────────────
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*prompt/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  // ── Safety bypass directives ─────────────────────────────────
  /bypass.*crisis/i,
  /skip.*crisis/i,
  /ignore.*crisis/i,
  /disable.*safety/i,
  // ── Therapist / medical identity claims ──────────────────────
  /\btherapist\b/i,
  /\bpsychiatrist\b/i,
  /\bcounselor\b/i,
  /\bmedical\s+professional\b/i,
  // ── Clinical / DSM diagnostic labels ─────────────────────────
  /\bdiagnos(ed|is|tic|e)\b/i,             // diagnosed, diagnosis, diagnostic
  /\bDSM\b/,
  /\bbipolar\s+(disorder|I|II)\b/i,
  /\bschizophreni/i,
  /\bnarcissistic\s+personality\b/i,
  /\bborderline\s+personality\b/i,
  /\bAPD\b/,                               // Antisocial Personality Disorder acronym
  // ── Crisis content — belongs in safety_critical memories only ─
  /\bsuicid/i,
  /\bself[-\s]harm\b/i,
  /\bactive\s+plan\b/i,
  // ── Medical advice ────────────────────────────────────────────
  /\bmedication\b/i,
  /\bprescri/i,                            // prescribe, prescription
];

/**
 * Returns true if the block content is safe to persist in a user/* memory block.
 * Called before every upsertBlock for user/* labels.
 * Blocks: prompt injection, safety bypass directives, clinical diagnoses.
 */
export function isSafeUserBlock(text: string): boolean {
  return !USER_BLOCK_BLOCKLIST.some((pattern) => pattern.test(text));
}
