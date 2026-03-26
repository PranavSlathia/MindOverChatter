vi.mock("../../db/index.js", () => ({
  db: {},
}));

vi.mock("../../db/schema/index.js", () => ({
  assessments: {},
  memories: {},
  patientUnderstandingItems: {},
  patientUnderstandingSnapshots: {},
  reflections: {},
  reflectiveQuestions: {},
  sessionSummaries: {},
  sessions: {},
  therapyPlans: {},
  userFormulations: {},
}));

import { describe, expect, it, vi } from "vitest";
import { patientUnderstandingInternals } from "../patient-understanding-service.js";

describe("patient-understanding-service internals", () => {
  it("marks hypothesis as supported when it has one assessment match and one narrative match", () => {
    const result = patientUnderstandingInternals.buildHypothesisCandidates({
      rawHypotheses: [
        {
          hypothesis: "Persistent anxiety around work pressure",
          confidence: 0.81,
          evidence: "Worry escalates during work deadlines and is affecting rest.",
        },
      ],
      assessments: [
        {
          id: "a1",
          type: "gad7",
          totalScore: 15,
          severity: "moderate",
          answers: [],
          createdAt: new Date("2026-03-20T00:00:00.000Z"),
        },
      ],
      narrativeSources: [
        {
          sourceType: "reflection",
          sourceId: "r1",
          createdAt: "2026-03-21T00:00:00.000Z",
          text: "My work deadlines make my anxiety spike and I stop sleeping well.",
        },
      ],
      therapyPlanId: "tp1",
      therapyPlanCreatedAt: new Date("2026-03-22T00:00:00.000Z"),
    });

    expect(result.supported).toHaveLength(1);
    expect(result.suppressedCount).toBe(0);
  });

  it("suppresses hypothesis when it has only a single narrative source and no assessment corroboration", () => {
    const result = patientUnderstandingInternals.buildHypothesisCandidates({
      rawHypotheses: [
        {
          hypothesis: "Trauma-linked hypervigilance",
          confidence: 0.77,
          evidence: "The user may be feeling on edge after difficult reminders.",
        },
      ],
      assessments: [],
      narrativeSources: [
        {
          sourceType: "reflection",
          sourceId: "r1",
          createdAt: "2026-03-21T00:00:00.000Z",
          text: "I feel on edge sometimes after hard conversations.",
        },
      ],
      therapyPlanId: "tp1",
      therapyPlanCreatedAt: new Date("2026-03-22T00:00:00.000Z"),
    });

    expect(result.supported).toHaveLength(0);
    expect(result.suppressedCount).toBe(1);
  });

  it("derives worsening trend when severity rank increases over time", () => {
    const trend = patientUnderstandingInternals.computeAssessmentTrend([
      {
        id: "a1",
        type: "gad7",
        totalScore: 6,
        severity: "mild",
        answers: [],
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
      },
      {
        id: "a2",
        type: "gad7",
        totalScore: 14,
        severity: "moderate",
        answers: [],
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
      },
    ]);

    expect(trend).toBe("worsening");
  });
});
