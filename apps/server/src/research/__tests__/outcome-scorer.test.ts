import { describe, expect, test } from "vitest";
import { scoreOutcome } from "../lib/outcome-scorer.js";
import type { AssessmentRow } from "../lib/read-only-queries.js";

// ── Fixtures ──────────────────────────────────────────────────────

function makeRow(
  type: string,
  totalScore: number,
  severity: string,
  offsetDays = 0,
): AssessmentRow {
  const d = new Date("2026-01-15T12:00:00Z");
  d.setDate(d.getDate() - offsetDays);
  return {
    id: `id-${type}-${totalScore}-${offsetDays}`,
    type,
    totalScore,
    severity,
    createdAt: d,
  };
}

// ── Zero assessments ──────────────────────────────────────────────

describe("scoreOutcome — empty input", () => {
  test("empty array → score 0.5, direction unknown, confidence absent, assessmentsUsed 0", () => {
    const result = scoreOutcome([]);
    expect(result.score).toBe(0.5);
    expect(result.direction).toBe("unknown");
    expect(result.confidence).toBe("absent");
    expect(result.assessmentsUsed).toBe(0);
    expect(result.reasoning).toContain("No assessments");
  });
});

// ── Single assessment ─────────────────────────────────────────────

describe("scoreOutcome — single assessment", () => {
  test("single PHQ-9 score=0 → confidence sparse, direction unknown, score ~1.0", () => {
    const result = scoreOutcome([makeRow("phq9", 0, "none")]);
    expect(result.confidence).toBe("sparse");
    expect(result.direction).toBe("unknown");
    expect(result.score).toBeCloseTo(1.0, 4);
    expect(result.assessmentsUsed).toBe(1);
  });

  test("single PHQ-9 score=27 → confidence sparse, score ~0.0", () => {
    const result = scoreOutcome([makeRow("phq9", 27, "severe")]);
    expect(result.confidence).toBe("sparse");
    expect(result.direction).toBe("unknown");
    expect(result.score).toBeCloseTo(0.0, 4);
    expect(result.assessmentsUsed).toBe(1);
  });

  test("single GAD-7 score=14 → score ~0.333 (1 - 14/21)", () => {
    const result = scoreOutcome([makeRow("gad7", 14, "moderate")]);
    expect(result.confidence).toBe("sparse");
    expect(result.direction).toBe("unknown");
    expect(result.score).toBeCloseTo(1 - 14 / 21, 3);
    expect(result.assessmentsUsed).toBe(1);
  });
});

// ── Two assessments ───────────────────────────────────────────────

describe("scoreOutcome — two assessments", () => {
  test("two assessments → confidence sparse", () => {
    const result = scoreOutcome([
      makeRow("phq9", 15, "moderate", 0),
      makeRow("phq9", 18, "moderate_severe", 7),
    ]);
    expect(result.confidence).toBe("sparse");
    expect(result.assessmentsUsed).toBe(2);
  });
});

// ── Three assessments → emerging ──────────────────────────────────

describe("scoreOutcome — three assessments", () => {
  test("three assessments → confidence emerging", () => {
    const result = scoreOutcome([
      makeRow("phq9", 10, "moderate", 0),
      makeRow("phq9", 14, "moderate", 7),
      makeRow("phq9", 18, "moderate_severe", 14),
    ]);
    expect(result.confidence).toBe("emerging");
    expect(result.assessmentsUsed).toBe(3);
  });
});

// ── Five assessments → strong ─────────────────────────────────────

describe("scoreOutcome — five assessments", () => {
  test("five assessments → confidence strong", () => {
    const rows = [0, 7, 14, 21, 28].map((offset, i) =>
      makeRow("phq9", 10 + i, "moderate", offset),
    );
    const result = scoreOutcome(rows);
    expect(result.confidence).toBe("strong");
    expect(result.assessmentsUsed).toBe(5);
  });
});

// ── Direction: improving ──────────────────────────────────────────
// Note: assessments arrive DESC by createdAt (most recent first).
// For trajectory: scores 20→15→10 means most recent = 10 (offset 0),
// middle = 15 (offset 7), oldest = 20 (offset 14).
// DESC order passed in = [row(10,0), row(15,7), row(20,14)].
// scoreOutcome slices first 3 and reverses → [20,15,10].
// Slope of [20/27, 15/27, 10/27] = negative → improving.

describe("scoreOutcome — direction improving", () => {
  test("PHQ-9 trajectory 20→15→10 (most recent first) → improving", () => {
    const rows = [
      makeRow("phq9", 10, "moderate", 0),
      makeRow("phq9", 15, "moderate", 7),
      makeRow("phq9", 20, "moderate_severe", 14),
    ];
    const result = scoreOutcome(rows);
    expect(result.direction).toBe("improving");
    // Latest is 10 → score = 1 - 10/27 ≈ 0.63
    expect(result.score).toBeCloseTo(1 - 10 / 27, 3);
  });
});

// ── Direction: worsening ──────────────────────────────────────────
// DESC order: [row(20,0), row(15,7), row(10,14)] → reversed for slope: [10,15,20]
// Slope is positive → worsening.

describe("scoreOutcome — direction worsening", () => {
  test("PHQ-9 trajectory 10→15→20 (most recent first) → worsening", () => {
    const rows = [
      makeRow("phq9", 20, "moderate_severe", 0),
      makeRow("phq9", 15, "moderate", 7),
      makeRow("phq9", 10, "moderate", 14),
    ];
    const result = scoreOutcome(rows);
    expect(result.direction).toBe("worsening");
    // Latest is 20 → score = 1 - 20/27 ≈ 0.259
    expect(result.score).toBeCloseTo(1 - 20 / 27, 3);
  });
});

// ── Direction: stable ─────────────────────────────────────────────
// DESC order: [row(12,0), row(13,7), row(12,14)] → reversed: [12,13,12]
// Slope ≈ 0 → stable.

describe("scoreOutcome — direction stable", () => {
  test("PHQ-9 trajectory 12→13→12 → stable", () => {
    const rows = [
      makeRow("phq9", 12, "moderate", 0),
      makeRow("phq9", 13, "moderate", 7),
      makeRow("phq9", 12, "moderate", 14),
    ];
    const result = scoreOutcome(rows);
    expect(result.direction).toBe("stable");
  });
});

// ── Normalization: PHQ-9 max = 27 ────────────────────────────────

describe("scoreOutcome — PHQ-9 normalization", () => {
  test("PHQ-9 score=27 normalizes to 1.0 (full range), outcome score = 0.0", () => {
    // Single assessment, direction=unknown
    const result = scoreOutcome([makeRow("phq9", 27, "severe")]);
    // 27/27 = 1.0 normalized → outcome score = 1 - 1.0 = 0.0
    expect(result.score).toBeCloseTo(0.0, 4);
  });

  test("PHQ-9 score=0 normalizes to 0.0 (no symptoms), outcome score = 1.0", () => {
    const result = scoreOutcome([makeRow("phq9", 0, "none")]);
    expect(result.score).toBeCloseTo(1.0, 4);
  });
});

// ── Normalization: GAD-7 max = 21 ────────────────────────────────

describe("scoreOutcome — GAD-7 normalization", () => {
  test("GAD-7 score=21 normalizes to 1.0, outcome score = 0.0", () => {
    const result = scoreOutcome([makeRow("gad7", 21, "severe")]);
    expect(result.score).toBeCloseTo(0.0, 4);
  });

  test("GAD-7 score=7 normalizes to 7/21 = 0.333, outcome score ≈ 0.667", () => {
    const result = scoreOutcome([makeRow("gad7", 7, "mild")]);
    expect(result.score).toBeCloseTo(1 - 7 / 21, 3);
  });
});

// ── assessmentsUsed ───────────────────────────────────────────────

describe("scoreOutcome — assessmentsUsed matches input length", () => {
  test.each([1, 2, 3, 4, 5, 6])(
    "input length %i → assessmentsUsed = %i",
    (n) => {
      const rows = Array.from({ length: n }, (_, i) =>
        makeRow("phq9", 10, "moderate", i * 7),
      );
      const result = scoreOutcome(rows);
      expect(result.assessmentsUsed).toBe(n);
    },
  );
});

// ── Outcome score is always 0–1 ───────────────────────────────────

describe("scoreOutcome — score always clamped 0.0–1.0", () => {
  test("very high PHQ-9 score does not produce negative outcome score", () => {
    const result = scoreOutcome([makeRow("phq9", 27, "severe")]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test("zero score does not exceed 1.0", () => {
    const result = scoreOutcome([makeRow("phq9", 0, "none")]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// ── Unknown type ──────────────────────────────────────────────────

describe("scoreOutcome — unknown assessment type", () => {
  test("unknown type with score 50 → normalizes as 50/50 = 1.0 (raw=max fallback)", () => {
    // MAX_SCORE fallback is `raw` itself when type not in map → normalizeScore = 1.0
    const result = scoreOutcome([makeRow("custom_scale", 50, "unknown")]);
    expect(result.score).toBeCloseTo(0.0, 4); // 1 - 1.0 = 0.0
    expect(result.confidence).toBe("sparse");
  });
});

// ── Reasoning string ──────────────────────────────────────────────

describe("scoreOutcome — reasoning field", () => {
  test("reasoning is non-empty for all inputs", () => {
    const cases: AssessmentRow[][] = [
      [],
      [makeRow("phq9", 10, "moderate")],
      [makeRow("phq9", 10, "moderate", 0), makeRow("phq9", 15, "moderate", 7)],
    ];
    for (const rows of cases) {
      const result = scoreOutcome(rows);
      expect(result.reasoning.length).toBeGreaterThan(0);
    }
  });
});
