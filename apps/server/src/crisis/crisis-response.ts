import { HELPLINES } from "@moc/shared";
import type { CrisisResponseContent, HaikuRiskLevel, KeywordSeverity } from "./types.js";

// ── Hard-Coded Crisis Responses ─────────────────────────────────
// These are NEVER AI-generated. They are static, human-authored
// messages that provide empathetic acknowledgment and direct the
// user to professional resources.
//
// NON-NEGOTIABLE: Do not make these dynamic or AI-generated.

const HIGH_SEVERITY_MESSAGE = `I hear you, and I want you to know that what you're feeling matters. Right now, it sounds like you're going through something really serious, and I want to make sure you get the support you deserve.

Please reach out to one of these crisis resources — they have trained professionals available to help you right now:

- **988 Suicide & Crisis Lifeline**: Call or text **988** (US)
- **iCall**: **9152987821** (India)
- **Vandrevala Foundation**: **1860-2662-345** (India)

You don't have to face this alone. These helplines are free, confidential, and available 24/7.

This app is a wellness companion, not a replacement for professional help. Please reach out to someone who can truly support you through this.`;

const MEDIUM_SEVERITY_MESSAGE = `I can hear that you're going through a really difficult time, and I appreciate you sharing that with me. What you're feeling is valid.

I want to make sure you have access to professional support if you need it:

- **988 Suicide & Crisis Lifeline**: Call or text **988** (US)
- **iCall**: **9152987821** (India)
- **Vandrevala Foundation**: **1860-2662-345** (India)

These helplines are free, confidential, and staffed by trained professionals who understand what you're going through.

As a wellness companion, I'm here to support your day-to-day wellbeing, but for what you're describing, connecting with a professional would be the most helpful step.`;

/**
 * Returns the appropriate hard-coded crisis response based on severity.
 *
 * HIGH severity: Active suicidal ideation, self-harm intent, immediate danger.
 * MEDIUM severity: Passive ideation, harm to others, elevated risk signals.
 *
 * For "low" keyword severity or haiku-only "elevated" classifications,
 * the detector may still route here — the medium response is the floor.
 *
 * @param severity - The detected severity level
 * @returns Hard-coded crisis response content (never AI-generated)
 */
export function getCrisisResponse(
  severity: KeywordSeverity | HaikuRiskLevel,
): CrisisResponseContent {
  const isHigh = severity === "high" || severity === "crisis";

  return {
    message: isHigh ? HIGH_SEVERITY_MESSAGE : MEDIUM_SEVERITY_MESSAGE,
    helplines: HELPLINES,
    severity,
  };
}
