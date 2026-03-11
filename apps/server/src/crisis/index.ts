// ── Crisis Detection Module ─────────────────────────────────────
// Two-stage crisis detection pipeline for MindOverChatter.
//
// Stage 1: Deterministic keyword matching (fast, ~0ms)
// Stage 2: Claude Haiku classification (nuanced, ~1-5s)
//
// Crisis responses are HARD-CODED — never AI-generated.
// False positives are acceptable; false negatives are NOT.

export { getCrisisResponse } from "./crisis-response.js";
export { detectCrisis } from "./detector.js";
export { classifyWithHaiku } from "./haiku-classifier.js";
export { detectKeywords } from "./keyword-detector.js";
export type {
  CrisisResponseContent,
  CrisisResult,
  HaikuResult,
  HaikuRiskLevel,
  KeywordResult,
  KeywordSeverity,
} from "./types.js";
