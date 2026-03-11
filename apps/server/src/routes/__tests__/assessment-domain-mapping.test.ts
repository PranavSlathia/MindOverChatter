import { describe, expect, it } from "vitest";
import {
  computeDomainSignals,
  detectCorrelations,
  computeDomainTrends,
  type AssessmentInput,
} from "../assessment-domain-mapping.js";

// ── Helper: create a minimal AssessmentInput ───────────────────

function makeAssessment(
  type: string,
  answers: number[],
  totalScore?: number,
  createdAt?: Date,
): AssessmentInput {
  return {
    type: type as any,
    answers,
    totalScore: totalScore ?? answers.reduce((s, v) => s + v, 0),
    severity: "minimal" as any,
    createdAt: createdAt ?? new Date("2026-03-01"),
  };
}

// ── B1: Domain Signal Computation ────────────────────────────────

describe("computeDomainSignals", () => {
  it("returns empty array when no assessments given", () => {
    expect(computeDomainSignals([])).toEqual([]);
  });

  it("PHQ-9 maps to vitality and momentum", () => {
    const signals = computeDomainSignals([
      makeAssessment("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3]), // score 27, max severity
    ]);
    const vitality = signals.find((s) => s.domain === "vitality");
    const momentum = signals.find((s) => s.domain === "momentum");
    expect(vitality).toBeDefined();
    expect(momentum).toBeDefined();
    expect(vitality!.score).toBeCloseTo(1.0, 1); // 27/27
    expect(vitality!.level).toBe("high");
    expect(vitality!.confidence).toBe(0.3); // single instrument
  });

  it("WHO-5 inverts correctly (high raw = low severity)", () => {
    const signals = computeDomainSignals([
      makeAssessment("who5", [5, 5, 5, 5, 5]), // score 25 = max wellbeing
    ]);
    const vitality = signals.find((s) => s.domain === "vitality");
    expect(vitality).toBeDefined();
    expect(vitality!.score).toBeCloseTo(0.0, 1); // inverted: 1 - 25/25 = 0
    expect(vitality!.level).toBe("low"); // low severity = good
  });

  it("Rosenberg inverts correctly (high self-esteem = low severity)", () => {
    // All 0 on Rosenberg: forward items contribute 0, reverse items contribute 3 each (5 reverse items)
    // rosenbergScore([0,0,0,0,0,0,0,0,0,0]) = 5*0 + 5*3 = 15
    const signals = computeDomainSignals([
      makeAssessment("rosenberg_se", [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), // high scores
    ]);
    const selfRegard = signals.find((s) => s.domain === "self_regard");
    expect(selfRegard).toBeDefined();
    // rosenbergScore with all 3s: forward items = 5*3 = 15, reverse = 5*(3-3) = 0. Total = 15
    // normalized = 1 - 15/30 = 0.5
    expect(selfRegard!.score).toBeCloseTo(0.5, 1);
  });

  it("MSPSS inverts correctly (high support = low severity)", () => {
    // All 7s = max support
    const signals = computeDomainSignals([
      makeAssessment("mspss", [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7]),
    ]);
    const connection = signals.find((s) => s.domain === "connection");
    expect(connection).toBeDefined();
    expect(connection!.score).toBeCloseTo(0.0, 1); // 1 - 7/7 = 0
    expect(connection!.level).toBe("low");
  });

  it("multiple instruments increase confidence", () => {
    const signals = computeDomainSignals([
      makeAssessment("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1]), // vitality
      makeAssessment("who5", [3, 3, 3, 3, 3]),                // vitality
      makeAssessment("isi", [2, 2, 2, 2, 2, 2, 2]),           // vitality
    ]);
    const vitality = signals.find((s) => s.domain === "vitality");
    expect(vitality!.confidence).toBeCloseTo(0.9, 5); // 3 instruments
  });

  it("deduplicates by type (keeps most recent)", () => {
    const signals = computeDomainSignals([
      makeAssessment("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0], 0, new Date("2026-01-01")),
      makeAssessment("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3], 27, new Date("2026-03-01")),
    ]);
    const vitality = signals.find((s) => s.domain === "vitality");
    expect(vitality!.score).toBeCloseTo(1.0, 1); // uses the later one (score 27)
  });

  it("ECR avoidance maps to connection", () => {
    // All 7s (max avoidance, some reverse scored)
    const answers = Array(36).fill(4); // neutral
    const signals = computeDomainSignals([makeAssessment("ecr", answers)]);
    const connection = signals.find((s) => s.domain === "connection");
    expect(connection).toBeDefined();
  });

  it("PSS maps to groundedness", () => {
    const signals = computeDomainSignals([
      makeAssessment("pss", [4, 4, 4, 0, 0, 0, 0, 0, 4, 4]),
    ]);
    const groundedness = signals.find((s) => s.domain === "groundedness");
    expect(groundedness).toBeDefined();
  });

  it("PCL-5 maps to groundedness and meaning", () => {
    const answers = Array(20).fill(3); // score 60
    const signals = computeDomainSignals([makeAssessment("pcl5", answers, 60)]);
    const groundedness = signals.find((s) => s.domain === "groundedness");
    const meaning = signals.find((s) => s.domain === "meaning");
    expect(groundedness).toBeDefined();
    expect(meaning).toBeDefined();
  });
});

// ── B2: Cross-Instrument Correlation ─────────────────────────────

describe("detectCorrelations", () => {
  it("returns insufficient_data when only 1 instrument per group", () => {
    const results = detectCorrelations([
      makeAssessment("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1]),
    ]);
    const depression = results.find((r) => r.constructName === "Depression");
    expect(depression!.convergence).toBe("insufficient_data");
  });

  it("detects converging depression (PHQ-9 + DASS-21 similar scores)", () => {
    // PHQ-9 moderate: score ~14 → 14/27 ≈ 0.52
    // DASS-21 depression ~22 → 22/42 ≈ 0.52
    const phq9Answers = [2, 2, 2, 2, 2, 2, 1, 1, 0]; // score 14
    const dass21Answers = Array(21).fill(0);
    // Set depression items (indices 2,4,9,12,15,16,20) to get depression ~22
    // Each item *2, need sum=11 before doubling
    dass21Answers[2] = 2; dass21Answers[4] = 2; dass21Answers[9] = 2;
    dass21Answers[12] = 2; dass21Answers[15] = 1; dass21Answers[16] = 1; dass21Answers[20] = 1;

    const results = detectCorrelations([
      makeAssessment("phq9", phq9Answers),
      makeAssessment("dass21", dass21Answers),
    ]);
    const depression = results.find((r) => r.constructName === "Depression");
    expect(depression!.convergence).toBe("converging");
  });

  it("detects diverging depression (PHQ-9 high, DASS-21 low)", () => {
    const phq9Answers = [3, 3, 3, 3, 3, 3, 3, 3, 3]; // score 27 → 27/27 = 1.0
    const dass21Answers = Array(21).fill(0); // depression = 0 → 0/42 = 0.0

    const results = detectCorrelations([
      makeAssessment("phq9", phq9Answers),
      makeAssessment("dass21", dass21Answers),
    ]);
    const depression = results.find((r) => r.constructName === "Depression");
    expect(depression!.convergence).toBe("diverging");
    expect(depression!.divergenceDetail).toBeDefined();
  });

  it("handles connection construct with multiple instruments", () => {
    // UCLA high loneliness, MSPSS low support, ECR high avoidance
    const uclaAnswers = Array(20).fill(4); // max loneliness
    const mspssAnswers = Array(12).fill(1); // min support
    const ecrAnswers = Array(36).fill(7); // max

    const results = detectCorrelations([
      makeAssessment("ucla_loneliness", uclaAnswers),
      makeAssessment("mspss", mspssAnswers),
      makeAssessment("ecr", ecrAnswers),
    ]);
    const connection = results.find((r) => r.constructName === "Connection");
    expect(connection!.instruments.length).toBe(3);
    expect(connection!.convergence).not.toBe("insufficient_data");
  });

  it("returns all 4 construct groups", () => {
    const results = detectCorrelations([]);
    expect(results.length).toBe(4);
    expect(results.map((r) => r.constructName).sort()).toEqual([
      "Anxiety",
      "Connection",
      "Depression",
      "Stress/Burnout",
    ]);
  });
});

// ── B3: Longitudinal Domain Trends ───────────────────────────────

describe("computeDomainTrends", () => {
  it("returns empty array for no assessments", () => {
    expect(computeDomainTrends([])).toEqual([]);
  });

  it("returns stable for single data point", () => {
    const trends = computeDomainTrends([
      makeAssessment("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1], 9, new Date("2026-03-01")),
    ]);
    const vitality = trends.find((t) => t.domain === "vitality");
    expect(vitality).toBeDefined();
    expect(vitality!.trend).toBe("stable");
    expect(vitality!.previousLevel).toBeNull();
  });

  it("detects improving trend (scores decreased over time)", () => {
    const trends = computeDomainTrends([
      makeAssessment("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3], 27, new Date("2026-01-01")), // severe
      makeAssessment("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0], 0, new Date("2026-03-01")),   // minimal
    ]);
    const vitality = trends.find((t) => t.domain === "vitality");
    expect(vitality!.trend).toBe("improving");
  });

  it("detects declining trend (scores increased over time)", () => {
    const trends = computeDomainTrends([
      makeAssessment("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0], 0, new Date("2026-01-01")),   // minimal
      makeAssessment("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3], 27, new Date("2026-03-01")),  // severe
    ]);
    const vitality = trends.find((t) => t.domain === "vitality");
    expect(vitality!.trend).toBe("declining");
  });

  it("detects stable when scores similar", () => {
    const trends = computeDomainTrends([
      makeAssessment("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1], 9, new Date("2026-01-01")),
      makeAssessment("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 0], 8, new Date("2026-03-01")),
    ]);
    const vitality = trends.find((t) => t.domain === "vitality");
    expect(vitality!.trend).toBe("stable");
  });

  it("computes periodDays correctly", () => {
    const trends = computeDomainTrends([
      makeAssessment("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0], 0, new Date("2026-01-01")),
      makeAssessment("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3], 27, new Date("2026-01-31")),
    ]);
    const vitality = trends.find((t) => t.domain === "vitality");
    expect(vitality!.periodDays).toBe(30);
  });
});
