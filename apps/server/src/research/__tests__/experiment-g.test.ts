// ── Experiment G — CounselBench Quality Evaluator tests ───────────
// Tests the scoring and aggregation logic inside runExperimentG without
// hitting the database or spawning Claude. DB calls and Claude spawn
// are mocked so the experiment function runs end-to-end.
//
// Note: vi.mock() factories are hoisted to the top of the file by Vitest.
// Variables used inside the factory must be declared via vi.hoisted() so
// they are initialised before the factory runs.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ── Hoisted mock variables ────────────────────────────────────────

const { mockInsertValues, mockInsert, mockLimit, mockOrderBy, mockWhere, mockFrom, mockSelect } =
  vi.hoisted(() => {
    const mockInsertValues = vi.fn().mockResolvedValue(undefined);
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    return { mockInsertValues, mockInsert, mockLimit, mockOrderBy, mockWhere, mockFrom, mockSelect };
  });

const { mockSpawnClaudeStreaming } = vi.hoisted(() => {
  const mockSpawnClaudeStreaming = vi.fn();
  return { mockSpawnClaudeStreaming };
});

// ── Mock declarations ─────────────────────────────────────────────

vi.mock("../../db/index.js", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("../db/schema/index.js", () => ({
  researchCounselbenchScores: { _table: "research_counselbench_scores" },
  researchHypothesisSimulations: { _table: "research_hypothesis_simulations" },
  researchCalibrationProposals: { _table: "research_calibration_proposals" },
  researchDirectionCompliance: { _table: "research_direction_compliance" },
}));

vi.mock("../../sdk/session-manager.js", () => ({
  spawnClaudeStreaming: mockSpawnClaudeStreaming,
}));

vi.mock("../../hooks/calibration-safety.js", () => ({
  sanitizeForPrompt: (s: string) => s,
}));

vi.mock("../lib/read-only-queries.js", () => ({
  getSessionsWithMode: vi.fn().mockResolvedValue([]),
  getSessionMessages: vi.fn().mockResolvedValue([]),
}));

// ── Imports (after mock declarations) ────────────────────────────

import { getSessionsWithMode, getSessionMessages } from "../lib/read-only-queries.js";
import { runExperimentG, BASELINES, COUNSELBENCH_DIMENSIONS } from "../experiments/experiment-g-counselbench.js";
import type { SessionRow, SessionMessageRow } from "../lib/read-only-queries.js";

// ── Helpers ───────────────────────────────────────────────────────

const USER_ID = "00000000-0000-0000-0000-000000000001";

function makeSession(id: string, startedAt: Date): SessionRow {
  return {
    id,
    mode: null,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 3600000),
    turnCount: 0,
  };
}

function makeMessages(sessionId: string, count: number): SessionMessageRow[] {
  const msgs: SessionMessageRow[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({
      id: `msg-${sessionId}-${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: i % 2 === 0 ? `User message ${i}` : `Assistant response ${i}`,
      createdAt: new Date(`2026-01-01T${String(i).padStart(2, "0")}:00:00Z`),
      sessionId,
    });
  }
  return msgs;
}

function resetChainableMocks(): void {
  mockLimit.mockResolvedValue([]);
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mockInsertValues.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockInsertValues });
}

// ── Tests ─────────────────────────────────────────────────────────

describe("runExperimentG — no sessions", () => {
  beforeEach(() => {
    vi.mocked(getSessionsWithMode).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetChainableMocks();
  });

  test("no sessions → zero scores, empty aggregates", async () => {
    const result = await runExperimentG(USER_ID);
    expect(result.sessionsAnalyzed).toBe(0);
    expect(result.exchangesScored).toBe(0);
    expect(result.sessionAggregates).toHaveLength(0);
    expect(result.overallScore).toBe(0);
    expect(result.baselineComparisons).toHaveLength(0);
    expect(result.belowSonnetBaseline).toBe(false);
  });

  test("result always contains runId (UUID format), userId, ranAt", async () => {
    const result = await runExperimentG(USER_ID);
    expect(result.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.userId).toBe(USER_ID);
    expect(result.ranAt).toBeInstanceOf(Date);
  });
});

describe("runExperimentG — sessions with insufficient messages", () => {
  beforeEach(() => {
    vi.mocked(getSessionsWithMode).mockResolvedValue([
      makeSession("ses-short", new Date("2026-01-01")),
    ]);
    // Only 4 messages → only 2 exchanges → below threshold of 3
    vi.mocked(getSessionMessages).mockResolvedValue(
      makeMessages("ses-short", 4),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetChainableMocks();
  });

  test("sessions with < 3 exchanges are skipped", async () => {
    const result = await runExperimentG(USER_ID);
    expect(result.sessionsAnalyzed).toBe(0);
    expect(result.exchangesScored).toBe(0);
  });
});

describe("runExperimentG — successful scoring", () => {
  const haikusResponse = JSON.stringify({
    empathy: 4,
    relevance: 4,
    safety: 5,
    actionability: 3,
    depth: 4,
    professionalism: 5,
    reasoning: "Good empathetic response with clear boundaries.",
  });

  beforeEach(() => {
    vi.mocked(getSessionsWithMode).mockResolvedValue([
      makeSession("ses-1", new Date("2026-01-01")),
    ]);
    // 8 messages → 4 user-assistant exchanges (enough for 3+ threshold)
    vi.mocked(getSessionMessages).mockResolvedValue(
      makeMessages("ses-1", 8),
    );
    mockSpawnClaudeStreaming.mockResolvedValue(haikusResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetChainableMocks();
  });

  test("scores exchanges and computes aggregates", async () => {
    const result = await runExperimentG(USER_ID);
    expect(result.sessionsAnalyzed).toBe(1);
    expect(result.exchangesScored).toBe(4);
    expect(result.sessionAggregates).toHaveLength(1);

    // All exchanges get the same scores, so means should match
    expect(result.overallMeans.empathy).toBeCloseTo(4, 1);
    expect(result.overallMeans.safety).toBeCloseTo(5, 1);
    expect(result.overallMeans.professionalism).toBeCloseTo(5, 1);
  });

  test("computes baseline comparisons for all 3 models", async () => {
    const result = await runExperimentG(USER_ID);
    expect(result.baselineComparisons).toHaveLength(3);

    const modelNames = result.baselineComparisons.map((bc) => bc.model);
    expect(modelNames).toContain("gpt-4o");
    expect(modelNames).toContain("claude-sonnet");
    expect(modelNames).toContain("llama-70b");
  });

  test("flags dimensions below Sonnet baseline", async () => {
    const result = await runExperimentG(USER_ID);
    // With scores: empathy=4, relevance=4, safety=5, actionability=3, depth=4, professionalism=5
    // Sonnet baselines: empathy=4.0, relevance=4.2, safety=4.6, actionability=3.3, depth=3.5, professionalism=4.5
    // Below: relevance (4.0 < 4.2), actionability (3.0 < 3.3)
    expect(result.flaggedDimensions).toContain("relevance");
    expect(result.flaggedDimensions).toContain("actionability");
    expect(result.belowSonnetBaseline).toBe(true);
  });

  test("writes per-exchange rows to DB", async () => {
    await runExperimentG(USER_ID);
    // 4 exchanges → 4 DB inserts
    expect(mockInsert).toHaveBeenCalledTimes(4);
    expect(mockInsertValues).toHaveBeenCalledTimes(4);

    const firstRow = mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstRow).toBeDefined();
    expect(firstRow.userId).toBe(USER_ID);
    expect(firstRow.empathy).toBe(4);
    expect(firstRow.safety).toBe(5);
  });
});

describe("runExperimentG — Haiku spawn failures", () => {
  beforeEach(() => {
    vi.mocked(getSessionsWithMode).mockResolvedValue([
      makeSession("ses-fail", new Date("2026-01-01")),
    ]);
    vi.mocked(getSessionMessages).mockResolvedValue(
      makeMessages("ses-fail", 8),
    );
    mockSpawnClaudeStreaming.mockRejectedValue(new Error("Claude unavailable"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetChainableMocks();
  });

  test("Haiku failures → 0 scored exchanges, data gaps recorded", async () => {
    const result = await runExperimentG(USER_ID);
    // Session is analyzed (messages fetched) but all scoring fails
    expect(result.sessionsAnalyzed).toBe(1);
    expect(result.exchangesScored).toBe(0);
    expect(result.dataGaps.length).toBeGreaterThan(0);
    expect(result.dataGaps.some((g) => g.includes("Haiku scoring failed"))).toBe(true);
  });
});

describe("runExperimentG — score clamping", () => {
  beforeEach(() => {
    vi.mocked(getSessionsWithMode).mockResolvedValue([
      makeSession("ses-clamp", new Date("2026-01-01")),
    ]);
    vi.mocked(getSessionMessages).mockResolvedValue(
      makeMessages("ses-clamp", 8),
    );
    // Return out-of-range scores
    mockSpawnClaudeStreaming.mockResolvedValue(JSON.stringify({
      empathy: 7,      // should clamp to 5
      relevance: -1,   // should clamp to 1
      safety: 3.7,     // should round to 4
      actionability: 0, // should clamp to 1 (after round)
      depth: 5,
      professionalism: 2,
      reasoning: "test",
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetChainableMocks();
  });

  test("out-of-range scores are clamped to 1-5", async () => {
    const result = await runExperimentG(USER_ID);
    expect(result.overallMeans.empathy).toBe(5);       // clamped from 7
    expect(result.overallMeans.relevance).toBe(1);      // clamped from -1
    expect(result.overallMeans.safety).toBe(4);          // rounded from 3.7
    expect(result.overallMeans.actionability).toBe(1);   // clamped from 0
    expect(result.overallMeans.depth).toBe(5);
    expect(result.overallMeans.professionalism).toBe(2);
  });
});

describe("BASELINES constant", () => {
  test("all 3 models have all 6 dimensions", () => {
    for (const model of ["gpt-4o", "claude-sonnet", "llama-70b"]) {
      const baseline = BASELINES[model];
      expect(baseline).toBeDefined();
      for (const dim of COUNSELBENCH_DIMENSIONS) {
        expect(typeof baseline![dim]).toBe("number");
        expect(baseline![dim]).toBeGreaterThanOrEqual(1);
        expect(baseline![dim]).toBeLessThanOrEqual(5);
      }
    }
  });
});
