// ── Crisis Detection Types ──────────────────────────────────────
// These types are internal to the crisis module. The shared package
// already exports CrisisLevel ("safe" | "elevated_risk" | "crisis")
// which is used at the session/message layer.

/** Severity of a keyword match */
export type KeywordSeverity = "high" | "medium" | "low";

/** Result from Stage 1: deterministic keyword matching */
export interface KeywordResult {
  detected: boolean;
  severity: KeywordSeverity;
  matchedPhrases: string[];
  stage: "keyword";
}

/** Risk level from Stage 2: Haiku LLM classification */
export type HaikuRiskLevel = "crisis" | "elevated" | "low" | "none";

/** Result from Stage 2: Haiku classification */
export interface HaikuResult {
  risk_level: HaikuRiskLevel;
  reasoning: string;
  confidence: number;
  stage: "haiku";
}

/** Hard-coded crisis response content */
export interface CrisisResponseContent {
  message: string;
  helplines: ReadonlyArray<{
    readonly name: string;
    readonly number: string;
    readonly country: string;
  }>;
  severity: KeywordSeverity | HaikuRiskLevel;
}

/** Final combined result from the crisis detection pipeline */
export interface CrisisResult {
  isCrisis: boolean;
  severity: KeywordSeverity | HaikuRiskLevel;
  matchedPhrases: string[];
  stages: Array<"keyword" | "haiku">;
  response: CrisisResponseContent | null;
  haikuResult: HaikuResult | null;
}
