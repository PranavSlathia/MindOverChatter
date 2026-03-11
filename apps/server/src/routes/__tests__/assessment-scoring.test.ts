import { describe, expect, it } from "vitest";
import { computeSeverity, getNextScreener, getScreenerChain } from "../assessment-scoring.js";

// ── PHQ-9 Severity ────────────────────────────────────────────────

describe("computeSeverity — PHQ-9", () => {
  it("score 0 => minimal", () => {
    const r = computeSeverity("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r).toEqual({ totalScore: 0, severity: "minimal" });
  });

  it("score 4 (boundary) => minimal", () => {
    const r = computeSeverity("phq9", [1, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(r).toEqual({ totalScore: 4, severity: "minimal" });
  });

  it("score 5 (boundary) => mild", () => {
    const r = computeSeverity("phq9", [1, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(r).toEqual({ totalScore: 5, severity: "mild" });
  });

  it("score 9 (boundary) => mild", () => {
    const r = computeSeverity("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(r).toEqual({ totalScore: 9, severity: "mild" });
  });

  it("score 10 (boundary) => moderate", () => {
    const r = computeSeverity("phq9", [2, 2, 2, 2, 2, 0, 0, 0, 0]);
    expect(r).toEqual({ totalScore: 10, severity: "moderate" });
  });

  it("score 14 (boundary) => moderate", () => {
    const r = computeSeverity("phq9", [2, 2, 2, 2, 2, 2, 2, 0, 0]);
    expect(r).toEqual({ totalScore: 14, severity: "moderate" });
  });

  it("score 15 (boundary) => moderately_severe", () => {
    const r = computeSeverity("phq9", [2, 2, 2, 2, 2, 2, 2, 1, 0]);
    expect(r).toEqual({ totalScore: 15, severity: "moderately_severe" });
  });

  it("score 19 (boundary) => moderately_severe", () => {
    const r = computeSeverity("phq9", [3, 3, 3, 3, 3, 2, 2, 0, 0]);
    expect(r).toEqual({ totalScore: 19, severity: "moderately_severe" });
  });

  it("score 20 (boundary) => severe", () => {
    const r = computeSeverity("phq9", [3, 3, 3, 3, 3, 3, 2, 0, 0]);
    expect(r).toEqual({ totalScore: 20, severity: "severe" });
  });

  it("score 27 (max) => severe", () => {
    const r = computeSeverity("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(r).toEqual({ totalScore: 27, severity: "severe" });
  });
});

// ── GAD-7 Severity ────────────────────────────────────────────────

describe("computeSeverity — GAD-7", () => {
  it("score 0 => minimal", () => {
    const r = computeSeverity("gad7", [0, 0, 0, 0, 0, 0, 0]);
    expect(r).toEqual({ totalScore: 0, severity: "minimal" });
  });

  it("score 4 (boundary) => minimal", () => {
    const r = computeSeverity("gad7", [1, 1, 1, 1, 0, 0, 0]);
    expect(r).toEqual({ totalScore: 4, severity: "minimal" });
  });

  it("score 5 (boundary) => mild", () => {
    const r = computeSeverity("gad7", [1, 1, 1, 1, 1, 0, 0]);
    expect(r).toEqual({ totalScore: 5, severity: "mild" });
  });

  it("score 9 (boundary) => mild", () => {
    const r = computeSeverity("gad7", [2, 2, 2, 1, 1, 1, 0]);
    expect(r).toEqual({ totalScore: 9, severity: "mild" });
  });

  it("score 10 (boundary) => moderate", () => {
    const r = computeSeverity("gad7", [2, 2, 2, 2, 1, 1, 0]);
    expect(r).toEqual({ totalScore: 10, severity: "moderate" });
  });

  it("score 14 (boundary) => moderate", () => {
    const r = computeSeverity("gad7", [2, 2, 2, 2, 2, 2, 2]);
    expect(r).toEqual({ totalScore: 14, severity: "moderate" });
  });

  it("score 15 (boundary) => severe (GAD-7 has no moderately_severe)", () => {
    const r = computeSeverity("gad7", [3, 3, 3, 3, 3, 0, 0]);
    expect(r).toEqual({ totalScore: 15, severity: "severe" });
  });

  it("score 21 (max) => severe", () => {
    const r = computeSeverity("gad7", [3, 3, 3, 3, 3, 3, 3]);
    expect(r).toEqual({ totalScore: 21, severity: "severe" });
  });
});

// ── Screener Severity ─────────────────────────────────────────────

describe("computeSeverity — screeners", () => {
  it("iss_sleep: all zeros => minimal", () => {
    const r = computeSeverity("iss_sleep", [0, 0, 0, 0, 0, 0, 0]);
    expect(r.severity).toBe("minimal");
  });

  it("iss_sleep: moderate scores => moderate", () => {
    // 7 questions, max 21, threshold at 33%=6.9, 66%=13.9
    const r = computeSeverity("iss_sleep", [2, 2, 2, 1, 1, 1, 1]);
    expect(r.totalScore).toBe(10);
    expect(r.severity).toBe("moderate");
  });

  it("iss_sleep: high scores => severe", () => {
    const r = computeSeverity("iss_sleep", [3, 3, 3, 3, 2, 2, 2]);
    expect(r.totalScore).toBe(18);
    expect(r.severity).toBe("severe");
  });

  it("panic_screener: boundary at 33%", () => {
    // 7 questions, max 21, 33% = 6.93
    const r = computeSeverity("panic_screener", [1, 1, 1, 1, 1, 1, 1]);
    expect(r.totalScore).toBe(7);
    expect(r.severity).toBe("moderate"); // 7/21 = 0.333... > 0.33
  });

  it("trauma_gating: 4 questions, low score => minimal", () => {
    const r = computeSeverity("trauma_gating", [1, 0, 0, 0]);
    expect(r.totalScore).toBe(1);
    expect(r.severity).toBe("minimal"); // 1/12 = 0.083
  });

  it("substance_use: 4 questions, max => severe", () => {
    const r = computeSeverity("substance_use", [3, 3, 3, 3]);
    expect(r.totalScore).toBe(12);
    expect(r.severity).toBe("severe");
  });

  it("functioning: 5 questions, mid-range => moderate", () => {
    const r = computeSeverity("functioning", [2, 2, 1, 1, 1]);
    expect(r.totalScore).toBe(7);
    expect(r.severity).toBe("moderate"); // 7/15 = 0.467
  });

  it("relationship: 5 questions, all zeros => minimal", () => {
    const r = computeSeverity("relationship", [0, 0, 0, 0, 0]);
    expect(r.totalScore).toBe(0);
    expect(r.severity).toBe("minimal");
  });
});

// ── PHQ-9 Screener Chain ──────────────────────────────────────────

describe("getScreenerChain — PHQ-9", () => {
  it("minimal => empty chain", () => {
    expect(getScreenerChain("phq9", "minimal")).toEqual([]);
  });

  it("mild => [iss_sleep]", () => {
    expect(getScreenerChain("phq9", "mild")).toEqual(["iss_sleep"]);
  });

  it("moderate => [iss_sleep, functioning]", () => {
    expect(getScreenerChain("phq9", "moderate")).toEqual(["iss_sleep", "functioning"]);
  });

  it("moderately_severe => [iss_sleep, panic_screener, functioning]", () => {
    expect(getScreenerChain("phq9", "moderately_severe")).toEqual([
      "iss_sleep",
      "panic_screener",
      "functioning",
    ]);
  });

  it("severe => [iss_sleep, panic_screener, trauma_gating, functioning]", () => {
    expect(getScreenerChain("phq9", "severe")).toEqual([
      "iss_sleep",
      "panic_screener",
      "trauma_gating",
      "functioning",
    ]);
  });
});

// ── GAD-7 Screener Chain ──────────────────────────────────────────

describe("getScreenerChain — GAD-7", () => {
  it("minimal => empty chain", () => {
    expect(getScreenerChain("gad7", "minimal")).toEqual([]);
  });

  it("mild => [panic_screener]", () => {
    expect(getScreenerChain("gad7", "mild")).toEqual(["panic_screener"]);
  });

  it("moderate => [panic_screener, substance_use]", () => {
    expect(getScreenerChain("gad7", "moderate")).toEqual(["panic_screener", "substance_use"]);
  });

  it("severe => [panic_screener, substance_use, functioning]", () => {
    expect(getScreenerChain("gad7", "severe")).toEqual([
      "panic_screener",
      "substance_use",
      "functioning",
    ]);
  });
});

// ── Screener Types Return Empty Chain ────────────────────────────

describe("getScreenerChain — screener types", () => {
  it("iss_sleep returns empty chain", () => {
    expect(getScreenerChain("iss_sleep", "moderate")).toEqual([]);
  });

  it("panic_screener returns empty chain", () => {
    expect(getScreenerChain("panic_screener", "severe")).toEqual([]);
  });

  it("trauma_gating returns empty chain", () => {
    expect(getScreenerChain("trauma_gating", "minimal")).toEqual([]);
  });

  it("functioning returns empty chain", () => {
    expect(getScreenerChain("functioning", "moderate")).toEqual([]);
  });

  it("substance_use returns empty chain", () => {
    expect(getScreenerChain("substance_use", "severe")).toEqual([]);
  });

  it("relationship returns empty chain", () => {
    expect(getScreenerChain("relationship", "mild")).toEqual([]);
  });
});

// ── getNextScreener ──────────────────────────────────────────────

describe("getNextScreener", () => {
  it("PHQ-9 minimal => null (no screeners)", () => {
    expect(getNextScreener("phq9", "minimal")).toBeNull();
  });

  it("PHQ-9 mild => iss_sleep (first in chain)", () => {
    expect(getNextScreener("phq9", "mild")).toBe("iss_sleep");
  });

  it("PHQ-9 moderate with iss_sleep completed => functioning", () => {
    expect(
      getNextScreener("phq9", "moderate", new Set(["iss_sleep"])),
    ).toBe("functioning");
  });

  it("PHQ-9 moderate with both completed => null", () => {
    expect(
      getNextScreener("phq9", "moderate", new Set(["iss_sleep", "functioning"])),
    ).toBeNull();
  });

  it("PHQ-9 severe: walks through chain skipping completed", () => {
    // Chain: iss_sleep, panic_screener, trauma_gating, functioning
    expect(getNextScreener("phq9", "severe")).toBe("iss_sleep");
    expect(
      getNextScreener("phq9", "severe", new Set(["iss_sleep"])),
    ).toBe("panic_screener");
    expect(
      getNextScreener("phq9", "severe", new Set(["iss_sleep", "panic_screener"])),
    ).toBe("trauma_gating");
    expect(
      getNextScreener("phq9", "severe", new Set(["iss_sleep", "panic_screener", "trauma_gating"])),
    ).toBe("functioning");
    expect(
      getNextScreener("phq9", "severe", new Set(["iss_sleep", "panic_screener", "trauma_gating", "functioning"])),
    ).toBeNull();
  });

  it("GAD-7 severe: walks through chain", () => {
    expect(getNextScreener("gad7", "severe")).toBe("panic_screener");
    expect(
      getNextScreener("gad7", "severe", new Set(["panic_screener"])),
    ).toBe("substance_use");
    expect(
      getNextScreener("gad7", "severe", new Set(["panic_screener", "substance_use"])),
    ).toBe("functioning");
    expect(
      getNextScreener("gad7", "severe", new Set(["panic_screener", "substance_use", "functioning"])),
    ).toBeNull();
  });

  it("screener type always returns null", () => {
    expect(getNextScreener("iss_sleep", "severe")).toBeNull();
    expect(getNextScreener("panic_screener", "moderate")).toBeNull();
    expect(getNextScreener("trauma_gating", "minimal")).toBeNull();
  });
});
