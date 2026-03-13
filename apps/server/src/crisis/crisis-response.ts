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

// ── Hindi / Hinglish Hard-Coded Crisis Responses ─────────────────
// Same guarantees: NEVER AI-generated. Static, human-authored.

const HIGH_SEVERITY_MESSAGE_HI = `Main aapki baat sun raha/rahi hoon, aur jo aap feel kar rahe hain woh bahut important hai. Lagta hai aap abhi kuch bohot mushkil se guzar rahe hain — please kisi se baat karein jo sach mein madad kar sake.

Yeh helplines hain jo 24/7 available hain:
- iCall: 9152987821
- Vandrevala Foundation: 1860-2662-345
- 988 Suicide & Crisis Lifeline: 988 (US)

Aap akele nahi hain. Yeh free aur confidential hain.`;

const MEDIUM_SEVERITY_MESSAGE_HI = `Main sun raha/rahi hoon ki aap bahut mushkil waqt se guzar rahe hain, aur aapne mujhse share kiya — shukriya. Jo aap feel kar rahe hain woh bilkul valid hai.

Agar aapko professional support chahiye:
- iCall: 9152987821
- Vandrevala Foundation: 1860-2662-345
- 988 Suicide & Crisis Lifeline: 988 (US)

Yeh helplines free, confidential aur trained professionals ke saath hain.

Main ek wellness companion hoon — jo aap describe kar rahe hain uske liye kisi professional se baat karna sabse helpful hoga.`;

// ── Language Detection ────────────────────────────────────────────

const HINGLISH_MARKERS = [
  "hai", "nahi", "mujhe", "karo", "tha", "hoon", "yaar", "bhai", "aur", "kya",
];

/**
 * Detects whether a message is likely Hindi/Hinglish or English.
 * Uses Devanagari script presence as a strong signal, plus Hinglish
 * marker words as a secondary signal for romanised Hindi.
 */
function detectLanguage(message: string): "hindi" | "english" {
  const hasDevanagari = /[\u0900-\u097F]/.test(message);
  const words = message.toLowerCase().split(/\s+/);
  const hinglishCount = words.filter((w) => HINGLISH_MARKERS.includes(w)).length;
  return hasDevanagari || hinglishCount >= 2 ? "hindi" : "english";
}

/**
 * Returns the appropriate hard-coded crisis response based on severity.
 * When a message is provided, language detection selects the matching
 * response (Hindi/Hinglish or English).
 *
 * HIGH severity: Active suicidal ideation, self-harm intent, immediate danger.
 * MEDIUM severity: Passive ideation, harm to others, elevated risk signals.
 *
 * For "low" keyword severity or haiku-only "elevated" classifications,
 * the detector may still route here — the medium response is the floor.
 *
 * @param severity - The detected severity level
 * @param message  - Optional original user message for language detection
 * @returns Hard-coded crisis response content (never AI-generated)
 */
export function getCrisisResponse(
  severity: KeywordSeverity | HaikuRiskLevel,
  message?: string,
): CrisisResponseContent {
  const isHigh = severity === "high" || severity === "crisis";
  const lang = message ? detectLanguage(message) : "english";
  const msg =
    lang === "hindi"
      ? isHigh
        ? HIGH_SEVERITY_MESSAGE_HI
        : MEDIUM_SEVERITY_MESSAGE_HI
      : isHigh
        ? HIGH_SEVERITY_MESSAGE
        : MEDIUM_SEVERITY_MESSAGE;

  return {
    message: msg,
    helplines: HELPLINES,
    severity,
  };
}
