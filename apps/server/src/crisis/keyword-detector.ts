import type { KeywordResult, KeywordSeverity } from "./types.js";

// ── Crisis Keyword Definitions ──────────────────────────────────
// Organized by severity. Each entry is a phrase that will be matched
// case-insensitively against the user message. Word boundaries are
// used where appropriate to avoid false positives on substrings.
//
// IMPORTANT: False positives are acceptable; false negatives are NOT.

interface KeywordEntry {
  phrase: string;
  pattern: RegExp;
  severity: KeywordSeverity;
  category: string;
}

function phrase(text: string, severity: KeywordSeverity, category: string): KeywordEntry {
  // Escape regex special characters, then wrap with word boundaries
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    phrase: text,
    pattern: new RegExp(`\\b${escaped}\\b`, "i"),
    severity,
    category,
  };
}

// For Hinglish/transliterated phrases, use looser boundaries since
// \b doesn't work well with transliterated text embedded in English
function hindiPhrase(text: string, severity: KeywordSeverity, category: string): KeywordEntry {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    phrase: text,
    // Match with optional space/punctuation/start/end boundaries
    pattern: new RegExp(`(?:^|\\s|[.,!?;:])${escaped}(?:$|\\s|[.,!?;:])`, "i"),
    severity,
    category,
  };
}

const CRISIS_KEYWORDS: KeywordEntry[] = [
  // ── HIGH SEVERITY: Suicidal ideation ────────────────────────
  phrase("kill myself", "high", "suicidal_ideation"),
  phrase("want to die", "high", "suicidal_ideation"),
  phrase("end my life", "high", "suicidal_ideation"),
  phrase("suicide", "high", "suicidal_ideation"),
  phrase("end it all", "high", "suicidal_ideation"),
  phrase("no reason to live", "high", "suicidal_ideation"),
  phrase("better off dead", "high", "suicidal_ideation"),
  phrase("not worth living", "high", "suicidal_ideation"),
  phrase("suicidal", "high", "suicidal_ideation"),
  phrase("take my own life", "high", "suicidal_ideation"),
  phrase("don't want to be alive", "high", "suicidal_ideation"),
  phrase("wish i was dead", "high", "suicidal_ideation"),
  phrase("wish i were dead", "high", "suicidal_ideation"),

  // ── HIGH SEVERITY: Self-harm ────────────────────────────────
  phrase("cut myself", "high", "self_harm"),
  phrase("hurt myself", "high", "self_harm"),
  phrase("self harm", "high", "self_harm"),
  phrase("self-harm", "high", "self_harm"),
  phrase("burn myself", "high", "self_harm"),
  phrase("cutting myself", "high", "self_harm"),
  phrase("hurting myself", "high", "self_harm"),

  // ── HIGH SEVERITY: Immediate danger ─────────────────────────
  phrase("I have a gun", "high", "immediate_danger"),
  phrase("I have pills", "high", "immediate_danger"),
  phrase("standing on the edge", "high", "immediate_danger"),
  phrase("about to jump", "high", "immediate_danger"),
  phrase("going to jump", "high", "immediate_danger"),
  phrase("overdose", "high", "immediate_danger"),
  phrase("pull the trigger", "high", "immediate_danger"),
  phrase("slit my wrists", "high", "immediate_danger"),

  // ── HIGH SEVERITY: Hinglish suicidal ideation ───────────────
  hindiPhrase("mar jaunga", "high", "suicidal_ideation_hi"),
  hindiPhrase("mar jaungi", "high", "suicidal_ideation_hi"),
  hindiPhrase("jeena nahi hai", "high", "suicidal_ideation_hi"),
  hindiPhrase("khatam karna hai", "high", "suicidal_ideation_hi"),
  hindiPhrase("zindagi khatam", "high", "suicidal_ideation_hi"),
  hindiPhrase("marna chahta", "high", "suicidal_ideation_hi"),
  hindiPhrase("marna chahti", "high", "suicidal_ideation_hi"),
  hindiPhrase("khudkushi", "high", "suicidal_ideation_hi"),
  hindiPhrase("maut chahiye", "high", "suicidal_ideation_hi"),
  hindiPhrase("mar jaana chahta", "high", "suicidal_ideation_hi"),
  hindiPhrase("mar jaana chahti", "high", "suicidal_ideation_hi"),
  hindiPhrase("jaan de dunga", "high", "suicidal_ideation_hi"),
  hindiPhrase("jaan de dungi", "high", "suicidal_ideation_hi"),

  // ── MEDIUM SEVERITY: Harm to others ─────────────────────────
  phrase("kill someone", "medium", "harm_to_others"),
  phrase("hurt someone", "medium", "harm_to_others"),
  phrase("want to hurt", "medium", "harm_to_others"),
  phrase("kill him", "medium", "harm_to_others"),
  phrase("kill her", "medium", "harm_to_others"),
  phrase("kill them", "medium", "harm_to_others"),

  // ── MEDIUM SEVERITY: Passive ideation / hopelessness ────────
  phrase("don't want to live", "medium", "passive_ideation"),
  phrase("can't go on", "medium", "passive_ideation"),
  phrase("no point in living", "medium", "passive_ideation"),
  phrase("life is pointless", "medium", "passive_ideation"),
  phrase("I give up on life", "medium", "passive_ideation"),
  phrase("want it to be over", "medium", "passive_ideation"),
  phrase("want this to end", "medium", "passive_ideation"),

  // ── MEDIUM SEVERITY: Hinglish passive ideation ──────────────
  hindiPhrase("jeene ka mann nahi", "medium", "passive_ideation_hi"),
  hindiPhrase("sab khatam", "medium", "passive_ideation_hi"),
  hindiPhrase("koi fayda nahi", "medium", "passive_ideation_hi"),
];

/**
 * Stage 1: Deterministic keyword-based crisis detection.
 *
 * Scans the user message against a curated list of crisis phrases
 * in English and Hinglish. Returns immediately — no async, no LLM calls.
 *
 * Design: biased toward false positives. A false positive triggers
 * additional classification (Stage 2). A false negative is unacceptable.
 */
export function detectKeywords(message: string): KeywordResult {
  const matchedPhrases: string[] = [];
  let highestSeverity: KeywordSeverity = "low";

  for (const entry of CRISIS_KEYWORDS) {
    if (entry.pattern.test(message)) {
      matchedPhrases.push(entry.phrase);

      // Escalate severity: high > medium > low
      if (entry.severity === "high") {
        highestSeverity = "high";
      } else if (entry.severity === "medium" && highestSeverity !== "high") {
        highestSeverity = "medium";
      }
    }
  }

  return {
    detected: matchedPhrases.length > 0,
    severity: matchedPhrases.length > 0 ? highestSeverity : "low",
    matchedPhrases,
    stage: "keyword",
  };
}
