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
