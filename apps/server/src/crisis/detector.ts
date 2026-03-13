import { getCrisisResponse } from "./crisis-response.js";
import { classifyWithHaiku } from "./haiku-classifier.js";
import { detectKeywords } from "./keyword-detector.js";
import type { CrisisResult, HaikuRiskLevel } from "./types.js";

/**
 * Heuristic: does the message contain subtle distress signals that
 * didn't match explicit keywords but warrant Stage 2 classification?
 *
 * These are NOT crisis keywords — they're signals that the message
 * might contain nuanced or implicit risk that keyword matching misses.
 */
function needsClassification(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  const subtleSignals = [
    // Expressions of giving up or saying goodbye
    /\b(?:goodbye|good\s*bye|farewell)\b.*\b(?:forever|everyone|world)\b/,
    /\b(?:giving\s+away|leaving\s+everything)\b/,
    /\b(?:won't\s+be\s+around|not\s+be\s+here)\s+(?:much\s+longer|anymore|soon)\b/,
    /\b(?:final|last)\s+(?:message|note|letter|words)\b/,
    // Burden to others
    /\b(?:burden|better\s+without\s+me|everyone.*better.*if\s+i)\b/,
    // Preparations
    /\b(?:wrote\s+(?:a\s+)?(?:note|letter|will))\b/,
    /\b(?:put\s+(?:my\s+)?affairs\s+in\s+order)\b/,
    // Hinglish subtle signals
    /(?:sab\s+ko\s+alvida|alvida\s+dost|aakhri\s+baar)/i,
    /(?:mere\s+bina\s+better|mera\s+bojh)/i,
  ];

  return subtleSignals.some((pattern) => pattern.test(lowerMessage));
}

/**
 * Determines if a Haiku risk level constitutes a crisis that requires
 * the hard-coded crisis response.
 */
function isHaikuCrisis(riskLevel: HaikuRiskLevel): boolean {
  return riskLevel === "crisis" || riskLevel === "elevated";
}

/**
 * Main crisis detection pipeline.
 *
 * Two-stage architecture:
 *   Stage 1 (keyword): Fast, deterministic regex matching (~0ms).
 *   Stage 2 (haiku):   LLM classification for ambiguous/subtle cases (~1-5s).
 *
 * Routing logic:
 *   - HIGH keyword match (non-negated) → immediate crisis response (skip Stage 2)
 *   - HIGH keyword match (negated) → run Stage 2 for nuanced classification
 *   - MEDIUM keyword match → run Stage 2 for confirmation
 *   - No keyword match but subtle signals → run Stage 2
 *   - No signals at all → safe, return immediately
 *
 * Design principle: biased toward false positives. A false positive
 * shows a supportive crisis response. A false negative misses someone
 * in danger. The cost of the two is asymmetric.
 *
 * @param message - The user's message to check
 * @returns CrisisResult with detection outcome and response if crisis detected
 */
export async function detectCrisis(message: string): Promise<CrisisResult> {
  // Stage 1: Fast keyword check
  const keywordResult = detectKeywords(message);

  // HIGH severity keyword → immediate crisis response, no waiting for Stage 2
  // UNLESS the keyword is negated (e.g., "I do not want to kill myself"),
  // in which case we fall through to Stage 2 (Haiku) for nuanced classification.
  if (keywordResult.detected && keywordResult.severity === "high") {
    if (!keywordResult.isNegated) {
      // Non-negated HIGH → immediate crisis (unchanged behavior)
      return {
        isCrisis: true,
        severity: keywordResult.severity,
        matchedPhrases: keywordResult.matchedPhrases,
        stages: ["keyword"],
        response: getCrisisResponse("high", message),
        haikuResult: null,
      };
    }
    // Negated HIGH → fall through to Stage 2 for nuanced assessment
  }

  // Determine if we need Stage 2
  const shouldClassify =
    keywordResult.detected || needsClassification(message);

  if (!shouldClassify) {
    // No risk signals detected — safe
    return {
      isCrisis: false,
      severity: "low",
      matchedPhrases: [],
      stages: ["keyword"],
      response: null,
      haikuResult: null,
    };
  }

  // Stage 2: Haiku classification for medium-severity or subtle signals
  const haikuResult = await classifyWithHaiku(message);
  const stages: Array<"keyword" | "haiku"> = ["keyword", "haiku"];

  // If Haiku call failed, fall back to keyword result
  if (haikuResult === null) {
    // Keyword detected something (medium severity) but haiku failed.
    // Err on the side of caution — treat medium keyword match as crisis.
    if (keywordResult.detected) {
      return {
        isCrisis: true,
        severity: keywordResult.severity,
        matchedPhrases: keywordResult.matchedPhrases,
        stages: ["keyword"],
        response: getCrisisResponse(keywordResult.severity, message),
        haikuResult: null,
      };
    }

    // Only subtle signals triggered Stage 2, and it failed — can't confirm.
    // Since keyword didn't detect anything, return safe.
    return {
      isCrisis: false,
      severity: "low",
      matchedPhrases: [],
      stages: ["keyword"],
      response: null,
      haikuResult: null,
    };
  }

  // Haiku returned a result — use it to make the final determination
  if (isHaikuCrisis(haikuResult.risk_level)) {
    // Haiku confirmed crisis or elevated risk
    const combinedSeverity =
      haikuResult.risk_level === "crisis" || keywordResult.severity === "high"
        ? ("high" as const)
        : keywordResult.severity;

    return {
      isCrisis: true,
      severity: combinedSeverity,
      matchedPhrases: keywordResult.matchedPhrases,
      stages,
      response: getCrisisResponse(combinedSeverity, message),
      haikuResult,
    };
  }

  // Haiku says low or none — but keywords detected something
  if (keywordResult.detected) {
    // Keywords matched but Haiku disagrees. Since false positives are
    // acceptable, still flag as crisis for medium keywords, but add
    // the Haiku result for logging/audit.
    if (keywordResult.severity === "medium") {
      // Haiku overrode: it says low/none despite medium keywords.
      // Trust Haiku's nuanced assessment here — downgrade to non-crisis
      // but still include the keyword data for logging.
      return {
        isCrisis: false,
        severity: haikuResult.risk_level,
        matchedPhrases: keywordResult.matchedPhrases,
        stages,
        response: null,
        haikuResult,
      };
    }
  }

  // No crisis detected by either stage
  return {
    isCrisis: false,
    severity: haikuResult.risk_level,
    matchedPhrases: keywordResult.matchedPhrases,
    stages,
    response: null,
    haikuResult,
  };
}
