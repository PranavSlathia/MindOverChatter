import { describe, expect, it } from "vitest";
import {
  buildClinicalClassifications,
  buildClinicalContradictions,
  buildClinicalTriage,
  extractNarrativeCandidatesFromReflection,
} from "../clinical-rules-service.js";

describe("clinical-rules-service", () => {
  it("extracts structured evidence from reflection text", () => {
    const extracted = extractNarrativeCandidatesFromReflection({
      text: "My work deadlines make me anxious and I barely sleep. Writing this out helps a bit.",
      reflectionId: "r1",
      createdAt: new Date("2026-03-25T00:00:00.000Z"),
    });

    expect(extracted.map((entry) => entry.title)).toEqual(
      expect.arrayContaining([
        "Anxiety activation",
        "Sleep disruption",
        "Work or performance stress",
      ]),
    );
  });

  it("raises emergent triage when a crisis session exists", () => {
    const triage = buildClinicalTriage({
      assessments: [],
      understandingItems: [],
      crisisSessions: [
        {
          id: "s1",
          startedAt: new Date("2026-03-25T00:00:00.000Z"),
        },
      ],
    });

    expect(triage.priority).toBe("emergent");
    expect(triage.reasons[0]).toContain("crisis escalation");
  });

  it("creates a provisional classification from aligned assessment and narrative evidence", () => {
    const classifications = buildClinicalClassifications({
      assessments: [
        {
          id: "a1",
          type: "gad7",
          severity: "moderate",
          totalScore: 14,
          createdAt: new Date("2026-03-25T00:00:00.000Z"),
        },
      ],
      understandingItems: [
        {
          id: "u1",
          snapshotId: "snap1",
          userId: "user1",
          category: "symptom",
          title: "Anxiety activation",
          detail: "Worry and tension show up around work pressure.",
          provenance: "self_reported",
          confidence: 0.7,
          supportingEvidenceCount: 2,
          contradictingEvidenceCount: 0,
          status: "active",
          sourceRefs: [],
          lastReviewedAt: "2026-03-25T00:00:00.000Z",
          createdAt: "2026-03-25T00:00:00.000Z",
        },
      ],
    });

    expect(classifications[0]?.label).toBe("Anxiety symptom cluster");
  });

  it("emits contradictions for insufficient-evidence hypotheses with opposing evidence", () => {
    const contradictions = buildClinicalContradictions({
      hypotheses: [
        {
          hypothesis: "Persistent anxiety around work pressure",
          confidence: 0.62,
          evidence: "Earlier notes suggested persistent anxiety.",
          status: "insufficient_evidence",
          assessmentCount: 0,
          narrativeCount: 1,
          contradictingCount: 1,
          evidenceRefs: [],
          contradictionRefs: [
            {
              sourceType: "assessment",
              sourceId: "a1",
              createdAt: "2026-03-25T00:00:00.000Z",
              excerpt: "gad7:minimal",
            },
          ],
        },
      ],
      assessments: [],
    });

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]?.label).toContain("Persistent anxiety");
  });
});
