// ── Text Emotion Classifier ──────────────────────────────────────
// Lightweight rule-based classifier using keyword matching.
// Covers 6 basic emotions with English + Hinglish variant keywords.
//
// Architecture note: text signal weight = 0.8 (highest of the three channels).
// Confidence is deliberately conservative (0.3–0.6) because text is noisy
// and context-dependent — keywords alone are not sufficient for certainty.

export interface TextEmotionResult {
  emotion: string;
  valence: number; // -1 to 1 (negative to positive)
  arousal: number; // 0 to 1 (calm to activated)
  confidence: number; // 0.3 to 0.6 (text is noisy)
}

interface EmotionPattern {
  emotion: string;
  valence: number;
  arousal: number;
  keywords: string[];
}

// Keywords for each emotion category (English + Hinglish)
const EMOTION_PATTERNS: EmotionPattern[] = [
  {
    emotion: "happy",
    valence: 0.8,
    arousal: 0.6,
    keywords: [
      "happy",
      "excited",
      "great",
      "amazing",
      "wonderful",
      "joy",
      "joyful",
      "love",
      "loved",
      "khush",
      "khushi",
      "mast",
      "badiya",
      "zabardast",
      "accha lag raha",
    ],
  },
  {
    emotion: "sad",
    valence: -0.7,
    arousal: 0.2,
    keywords: [
      "sad",
      "depressed",
      "hopeless",
      "worthless",
      "empty",
      "numb",
      "crying",
      "tears",
      "grief",
      "dukhi",
      "udaas",
      "rone",
      "toot",
      "bura lag raha",
      "dard",
    ],
  },
  {
    emotion: "anxious",
    valence: -0.4,
    arousal: 0.8,
    keywords: [
      "anxious",
      "anxiety",
      "worried",
      "worry",
      "nervous",
      "panic",
      "scared",
      "fear",
      "terrified",
      "tension",
      "stress",
      "stressed",
      "dara",
      "ghabra",
      "takleef",
      "chinta",
      "pareshan",
    ],
  },
  {
    emotion: "angry",
    valence: -0.6,
    arousal: 0.9,
    keywords: [
      "angry",
      "anger",
      "furious",
      "rage",
      "frustrated",
      "irritated",
      "annoyed",
      "hate",
      "gussa",
      "krodh",
      "naraaz",
    ],
  },
  {
    emotion: "neutral",
    valence: 0.0,
    arousal: 0.4,
    keywords: ["okay", "ok", "fine", "alright", "nothing", "whatever", "normal"],
  },
];

/**
 * Classifies the emotional tone of a text message using keyword matching.
 *
 * Returns the best-matching emotion with valence/arousal coordinates and
 * a conservative confidence score. Returns null if no clear signal detected.
 *
 * @param message - The user's message to classify
 * @returns TextEmotionResult or null if no signal detected
 */
export function classifyTextEmotion(message: string): TextEmotionResult | null {
  const lower = message.toLowerCase();

  let bestMatch: (EmotionPattern & { matchCount: number }) | null = null;

  for (const pattern of EMOTION_PATTERNS) {
    const matchCount = pattern.keywords.filter((keyword) => lower.includes(keyword)).length;
    if (matchCount > 0) {
      if (!bestMatch || matchCount > bestMatch.matchCount) {
        bestMatch = { ...pattern, matchCount };
      }
    }
  }

  if (!bestMatch) return null;

  // Confidence scales with match count but stays in the "noisy text" range (0.3–0.6)
  const confidence = Math.min(0.6, 0.3 + bestMatch.matchCount * 0.1);

  return {
    emotion: bestMatch.emotion,
    valence: bestMatch.valence,
    arousal: bestMatch.arousal,
    confidence,
  };
}
