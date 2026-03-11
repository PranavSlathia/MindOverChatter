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
  /** If true, this entry is an inherently negated form (e.g., "marna nahi chahta") */
  inherentlyNegated?: boolean;
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

// For Hinglish phrases where negation ("nahi"/"nhi"/"nahin") is inserted
// between words, creating inherently negated forms like "marna nahi chahta"
function negatedHindiPhrase(text: string, severity: KeywordSeverity, category: string): KeywordEntry {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Insert optional negation word between every word boundary in the phrase
  const withNegation = escaped.replace(/\\?\s+/g, "\\s+(?:nahi|nhi|nahin)\\s+");
  return {
    phrase: text,
    pattern: new RegExp(`(?:^|\\s|[.,!?;:])${withNegation}(?:$|\\s|[.,!?;:])`, "i"),
    severity,
    category,
    inherentlyNegated: true,
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

  // ── HIGH SEVERITY: Hinglish negated forms ───────────────────
  // These match phrases with "nahi"/"nhi"/"nahin" inserted between
  // words (e.g., "marna nahi chahta"). They are inherently negated.
  negatedHindiPhrase("marna chahta", "high", "suicidal_ideation_hi"),
  negatedHindiPhrase("marna chahti", "high", "suicidal_ideation_hi"),
  negatedHindiPhrase("mar jaana chahta", "high", "suicidal_ideation_hi"),
  negatedHindiPhrase("mar jaana chahti", "high", "suicidal_ideation_hi"),
  negatedHindiPhrase("khatam karna hai", "high", "suicidal_ideation_hi"),

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

// ── Negation Detection ──────────────────────────────────────────
// Negation words in English and Hinglish. Used to check if a matched
// crisis phrase is being denied rather than expressed.

const NEGATION_PATTERNS: RegExp[] = [
  // English negations
  /\bnot\b/i,
  /\bdon'?t\b/i,
  /\bdo\s+not\b/i,
  /\bdoesn'?t\b/i,
  /\bnever\b/i,
  /\bno\b/i,
  /\bwon'?t\b/i,
  /\bwouldn'?t\b/i,
  /\bcan'?t\b/i,
  /\bisn'?t\b/i,
  /\bit'?s\s+not\s+like\b/i,
  /\bi'?m\s+not\b/i,
  /\bhave\s+no\b/i,
  /\bno\s+desire\b/i,
  // Hinglish negations
  /\bnahi\b/i,
  /\bnhi\b/i,
  /\bnahin\b/i,
];

/**
 * Maximum character distance before a matched keyword position to look
 * for negation words. Tuned so that direct negations like "I do not
 * want to kill myself" (13 chars) and "I'm not thinking about suicide"
 * (19 chars) are caught, while distant negations like "I'm not feeling
 * well and I want to kill myself" (31 chars) are NOT.
 */
const NEGATION_WINDOW_CHARS = 25;

/**
 * Maximum character distance AFTER a keyword match to look for Hinglish
 * negation words. Handles patterns like "khudkushi nahi karunga" where
 * the negation follows the keyword.
 */
const NEGATION_WINDOW_AFTER_CHARS = 15;

/** Hinglish-specific negation patterns for post-match checking */
const HINGLISH_NEGATION_PATTERNS: RegExp[] = [
  /\bnahi\b/i,
  /\bnhi\b/i,
  /\bnahin\b/i,
];

/**
 * Checks whether a keyword match at a given position in the message
 * is negated — either by a negation word preceding it within the
 * proximity window, or by a Hinglish negation word following it.
 */
function isMatchNegated(
  message: string,
  matchIndex: number,
  matchLength: number,
): boolean {
  // Check BEFORE the match (English + Hinglish negation)
  const windowStart = Math.max(0, matchIndex - NEGATION_WINDOW_CHARS);
  const precedingText = message.slice(windowStart, matchIndex);
  if (NEGATION_PATTERNS.some((pattern) => pattern.test(precedingText))) {
    return true;
  }

  // Check AFTER the match (Hinglish negation only)
  const matchEnd = matchIndex + matchLength;
  const followingText = message.slice(
    matchEnd,
    matchEnd + NEGATION_WINDOW_AFTER_CHARS,
  );
  if (
    HINGLISH_NEGATION_PATTERNS.some((pattern) => pattern.test(followingText))
  ) {
    return true;
  }

  return false;
}

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

  // Track which high-severity matches are negated
  let highMatchCount = 0;
  let negatedHighMatchCount = 0;

  for (const entry of CRISIS_KEYWORDS) {
    const match = entry.pattern.exec(message);
    if (match) {
      matchedPhrases.push(entry.phrase);

      // Escalate severity: high > medium > low
      if (entry.severity === "high") {
        highestSeverity = "high";
        highMatchCount++;

        // Check if this specific high-severity match is negated:
        // either inherently (e.g., "marna nahi chahta") or by proximity
        if (
          entry.inherentlyNegated ||
          isMatchNegated(message, match.index, match[0].length)
        ) {
          negatedHighMatchCount++;
        }
      } else if (entry.severity === "medium" && highestSeverity !== "high") {
        highestSeverity = "medium";
      }
    }
  }

  // isNegated is true ONLY if ALL high-severity matches are negated.
  // If even one high-severity phrase is not negated, isNegated is false.
  // For non-high messages, isNegated is always false (negation only
  // matters for the HIGH short-circuit path).
  const isNegated =
    highMatchCount > 0 && negatedHighMatchCount === highMatchCount;

  return {
    detected: matchedPhrases.length > 0,
    severity: matchedPhrases.length > 0 ? highestSeverity : "low",
    matchedPhrases,
    stage: "keyword",
    isNegated,
  };
}
