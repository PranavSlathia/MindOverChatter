import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/helpers.js", () => ({
  getOrCreateUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("../../services/clinical-handoff-report-service.js", () => ({
  getLatestClinicalHandoffReport: vi.fn(),
  generateAndPersistClinicalHandoffReport: vi.fn(),
  renderClinicalHandoffPdf: vi.fn(() => new Uint8Array([1, 2, 3])),
  renderClinicalHandoffFhirBundle: vi.fn(() => ({ resourceType: "Bundle" })),
}));

import reports from "../reports.js";
import {
  generateAndPersistClinicalHandoffReport,
  getLatestClinicalHandoffReport,
} from "../../services/clinical-handoff-report-service.js";

const app = new Hono().route("/", reports);

const sampleReport = {
  id: "7a22df2d-4254-466e-be1b-7f1c2fb791b8",
  userId: "11111111-1111-4111-8111-111111111111",
  sourceSnapshotId: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-03-26T12:15:33.802Z",
  dataConfidence: "emerging" as const,
  summary: {
    generatedFor: "clinician_handoff" as const,
    narrative: "Test narrative",
    caution: "Test caution",
  },
  presentingConcerns: [],
  symptomTimeline: [],
  assessmentSummary: {
    latest: [],
    trends: [],
  },
  functionalImpact: [],
  triggers: [],
  perpetuatingPatterns: [],
  protectiveFactors: [],
  copingStrategies: [],
  riskHistory: {
    crisisSessions: 0,
    safetyFlags: [],
    notes: [],
  },
  clinicalSignals: {
    triage: {
      framework: "mhGAP-inspired" as const,
      priority: "routine" as const,
      reasons: ["No urgent evidence"],
      evidenceRefs: [],
    },
    suspectedClassifications: [],
    contradictions: [],
  },
  openHypotheses: [],
  unansweredQuestions: [],
  evidenceCoverage: {
    understandingItems: 0,
    reflectionsIntegrated: 0,
    unsupportedHypothesesSuppressed: 0,
    hypothesisThreshold: "threshold",
    insufficientEvidenceSections: [],
  },
};

describe("Reports route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /latest returns 404 when no report exists", async () => {
    vi.mocked(getLatestClinicalHandoffReport).mockResolvedValueOnce(null);

    const res = await app.request("/latest");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No clinical handoff report exists yet" });
  });

  it("POST /generate returns a generated report", async () => {
    vi.mocked(generateAndPersistClinicalHandoffReport).mockResolvedValueOnce(sampleReport);

    const res = await app.request("/generate", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.id).toBe(sampleReport.id);
  });
});
