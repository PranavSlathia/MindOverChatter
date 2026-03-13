// ── Experiment B — Hypothesis Confidence Feedback Simulator tests ─
// Tests the pure simulation logic inside runExperimentB without hitting
// the database. DB calls are mocked so the experiment function runs end-to-end.
//
// Note: vi.mock() factories are hoisted to the top of the file by Vitest.
// Variables used inside the factory must be declared via vi.hoisted() so they
// are initialised before the factory runs.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ── Hoisted mock variables ────────────────────────────────────────
// These are created BEFORE the vi.mock() factory executes.

const { mockInsertValues, mockInsert, mockLimit, mockOrderBy, mockWhere, mockFrom, mockSelect } =
  vi.hoisted(() => {
    const mockInsertValues = vi.fn().mockResolvedValue(undefined);
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

    // Drizzle chainable: .select().from().where().orderBy().limit()
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    return { mockInsertValues, mockInsert, mockLimit, mockOrderBy, mockWhere, mockFrom, mockSelect };
  });

// ── Mock declarations ─────────────────────────────────────────────

vi.mock("../../db/index.js", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("../db/schema/index.js", () => ({
  researchHypothesisSimulations: { _table: "research_hypothesis_simulations" },
  researchCalibrationProposals: { _table: "research_calibration_proposals" },
  researchDirectionCompliance: { _table: "research_direction_compliance" },
}));

vi.mock("../lib/read-only-queries.js", () => ({
  getTherapyPlanHistory: vi.fn().mockResolvedValue([]),
  getSessionSummariesWithSessions: vi.fn().mockResolvedValue([]),
}));

// ── Imports (after mock declarations) ────────────────────────────

import { getSessionSummariesWithSessions, getTherapyPlanHistory } from "../lib/read-only-queries.js";
import { runExperimentB } from "../experiments/experiment-b-hypotheses.js";
import type { TherapyPlanRow, SessionSummaryWithSession } from "../lib/read-only-queries.js";

// ── Helpers ───────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";

function makePlan(
  id: string,
  version: number,
  hypotheses: Array<{ hypothesis: string; confidence: number }>,
  createdAt: Date,
): TherapyPlanRow {
  return {
    id,
    version,
    workingHypotheses: hypotheses.map((h) => ({
      ...h,
      evidence: "some evidence",
      internal_only: false,
    })),
    therapeuticGoals: [],
    recommendedSessionMode: "follow_support",
    createdAt,
  };
}

function makeSummary(
  summaryId: string,
  sessionId: string,
  themes: string[],
  cognitivePatterns: string[],
  sessionStartedAt: Date,
): SessionSummaryWithSession {
  return {
    summaryId,
    sessionId,
    themes,
    cognitivePatterns,
    actionItems: [],
    sessionStartedAt,
    sessionMode: "completed",
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe("runExperimentB — no plans", () => {
  beforeEach(() => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([]);
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset chainable mocks after clear
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  test("no plans → empty hypothesisDeltas", async () => {
    const result = await runExperimentB(USER_ID);
    expect(result.hypothesisDeltas).toHaveLength(0);
    expect(result.plansAnalyzedCount).toBe(0);
    expect(result.sessionsAnalyzedCount).toBe(0);
    expect(result.meanAbsoluteDelta).toBe(0);
    expect(result.maxDelta).toBe(0);
    expect(result.highDriftCount).toBe(0);
  });

  test("no plans → DB insert is called once with correct userId", async () => {
    await runExperimentB(USER_ID);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockInsertValues).toHaveBeenCalledOnce();
    const insertedRow = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow).toBeDefined();
    expect(insertedRow.userId).toBe(USER_ID);
    expect(insertedRow.plansAnalyzedCount).toBe(0);
    expect(insertedRow.highDriftCount).toBe(0);
  });
});

describe("runExperimentB — theme overlap increases confidence", () => {
  // Plans are created at session END. Correct pairing window: [prevPlan.createdAt, plan.createdAt).
  // Session must start BEFORE the plan date for pairing to succeed.
  const sessionDate = new Date("2026-01-01T00:00:00Z");
  const planDate = new Date("2026-01-10T00:00:00Z");

  beforeEach(() => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([
      makePlan(
        "plan-1",
        1,
        [{ hypothesis: "User experiences persistent anxiety rumination", confidence: 0.6 }],
        planDate,
      ),
    ]);
    // themes contain "anxiety" which overlaps with hypothesis keyword (4+ chars)
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([
      makeSummary("sum-1", "ses-1", ["anxiety management", "coping"], [], sessionDate),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  test("theme overlap → confidence increases by exactly 0.1", async () => {
    const result = await runExperimentB(USER_ID);
    expect(result.hypothesisDeltas).toHaveLength(1);
    const delta = result.hypothesisDeltas[0]!;
    expect(delta.actualConfidence).toBeCloseTo(0.6, 5);
    expect(delta.simulatedConfidence).toBeCloseTo(0.7, 5);
    expect(delta.delta).toBeCloseTo(0.1, 5);
    expect(delta.direction).toBe("increased");
  });
});

describe("runExperimentB — contradiction decreases confidence", () => {
  const sessionDate = new Date("2026-01-01T00:00:00Z");
  const planDate = new Date("2026-01-10T00:00:00Z");

  beforeEach(() => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([
      makePlan(
        "plan-2",
        1,
        [{ hypothesis: "User avoids conflict in relationships", confidence: 0.7 }],
        planDate,
      ),
    ]);
    // cognitivePatterns present (length > 10), no keyword overlap with "User avoids conflict"
    // "catastrophizing" has no overlap with "avoids", "conflict", "relationships", "user"
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([
      makeSummary(
        "sum-2",
        "ses-2",
        [],
        ["catastrophizing and magnification patterns observed"],
        sessionDate,
      ),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  test("contradiction heuristic → confidence decreases by exactly 0.15", async () => {
    const result = await runExperimentB(USER_ID);
    expect(result.hypothesisDeltas).toHaveLength(1);
    const delta = result.hypothesisDeltas[0]!;
    expect(delta.actualConfidence).toBeCloseTo(0.7, 5);
    expect(delta.simulatedConfidence).toBeCloseTo(0.55, 5);
    expect(delta.delta).toBeCloseTo(-0.15, 5);
    expect(delta.direction).toBe("decreased");
  });
});

describe("runExperimentB — confidence caps and floors", () => {
  const sessionDate = new Date("2026-01-01T00:00:00Z");
  const planDate = new Date("2026-01-10T00:00:00Z");

  afterEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  test("confidence cannot exceed 1.0 even with theme overlap", async () => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([
      makePlan(
        "plan-cap",
        1,
        [{ hypothesis: "anxiety triggers social withdrawal", confidence: 0.95 }],
        planDate,
      ),
    ]);
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([
      makeSummary("sum-cap", "ses-cap", ["anxiety and social avoidance"], [], sessionDate),
    ]);

    const result = await runExperimentB(USER_ID);
    const delta = result.hypothesisDeltas[0]!;
    expect(delta.simulatedConfidence).toBeLessThanOrEqual(1.0);
    // 0.95 + 0.1 = 1.05 → capped at 1.0
    expect(delta.simulatedConfidence).toBeCloseTo(1.0, 5);
  });

  test("confidence cannot go below 0.0 with contradiction", async () => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([
      makePlan(
        "plan-floor",
        1,
        [{ hypothesis: "User avoids emotional expression entirely", confidence: 0.1 }],
        planDate,
      ),
    ]);
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([
      makeSummary(
        "sum-floor",
        "ses-floor",
        [],
        ["deep catastrophizing and rumination patterns observed"],
        sessionDate,
      ),
    ]);

    const result = await runExperimentB(USER_ID);
    const delta = result.hypothesisDeltas[0]!;
    expect(delta.simulatedConfidence).toBeGreaterThanOrEqual(0.0);
    // 0.1 - 0.15 = -0.05 → floored at 0.0
    expect(delta.simulatedConfidence).toBeCloseTo(0.0, 5);
  });
});

describe("runExperimentB — highDriftCount and no-pair behaviour", () => {
  const planDate = new Date("2026-01-01T00:00:00Z");
  const sessionDate = new Date("2026-01-10T00:00:00Z");

  afterEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  test("highDriftCount is 0 when all |delta| <= 0.2 (single-event shift is at most 0.15)", async () => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([
      makePlan(
        "plan-drift",
        1,
        [
          { hypothesis: "anxiety reduces functioning", confidence: 0.6 },
          { hypothesis: "avoidance maintains symptoms", confidence: 0.6 },
        ],
        planDate,
      ),
    ]);
    // themes overlap with both → each gets +0.1, |delta|=0.1 < 0.2
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([
      makeSummary("sum-drift", "ses-drift", ["anxiety avoidance patterns"], [], sessionDate),
    ]);

    const result = await runExperimentB(USER_ID);
    expect(result.highDriftCount).toBe(0);
    expect(result.hypothesisDeltas).toHaveLength(2);
  });

  test("no paired summary → direction unchanged, delta = 0", async () => {
    // Session starts AFTER the plan date → falls outside [prevPlan.createdAt, plan.createdAt)
    // because sessionStartedAt >= plan.createdAt fails the upper bound check.
    const planDate = new Date("2026-01-01T00:00:00Z");
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([
      makePlan(
        "plan-no-pair",
        1,
        [{ hypothesis: "User struggles with sleep hygiene", confidence: 0.5 }],
        planDate,
      ),
    ]);
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([
      makeSummary("sum-old", "ses-old", ["sleep issues"], [], new Date("2026-06-01T00:00:00Z")),
    ]);

    const result = await runExperimentB(USER_ID);
    const delta = result.hypothesisDeltas[0]!;
    expect(delta.direction).toBe("unchanged");
    expect(delta.delta).toBeCloseTo(0, 5);
  });
});

describe("runExperimentB — result shape", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockInsertValues.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
  });

  test("result always contains runId (UUID format), userId, ranAt", async () => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([]);
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([]);

    const result = await runExperimentB(USER_ID);
    expect(result.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.userId).toBe(USER_ID);
    expect(result.ranAt).toBeInstanceOf(Date);
  });

  test("meanAbsoluteDelta and maxDelta are 0 when no hypotheses processed", async () => {
    vi.mocked(getTherapyPlanHistory).mockResolvedValue([]);
    vi.mocked(getSessionSummariesWithSessions).mockResolvedValue([]);

    const result = await runExperimentB(USER_ID);
    expect(result.meanAbsoluteDelta).toBe(0);
    expect(result.maxDelta).toBe(0);
  });
});
