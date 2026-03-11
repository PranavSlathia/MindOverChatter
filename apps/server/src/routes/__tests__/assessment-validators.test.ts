import { describe, expect, it } from "vitest";
import {
  SubmitAssessmentSchema,
  AssessmentTypeSchema,
  AssessmentSeveritySchema,
} from "@moc/shared";

describe("AssessmentTypeSchema", () => {
  it("accepts phq9", () => {
    expect(AssessmentTypeSchema.safeParse("phq9").success).toBe(true);
  });

  it("accepts gad7", () => {
    expect(AssessmentTypeSchema.safeParse("gad7").success).toBe(true);
  });

  it("accepts all screener types", () => {
    for (const t of ["iss_sleep", "panic_screener", "trauma_gating", "functioning", "substance_use", "relationship"]) {
      expect(AssessmentTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects unknown type", () => {
    expect(AssessmentTypeSchema.safeParse("unknown").success).toBe(false);
  });

  it("accepts Wave 3 types", () => {
    for (const t of ["pss", "mspss", "ecr", "pcl5", "ace_iq"]) {
      expect(AssessmentTypeSchema.safeParse(t).success).toBe(true);
    }
  });
});

describe("AssessmentSeveritySchema", () => {
  it("accepts all five levels", () => {
    for (const s of ["minimal", "mild", "moderate", "moderately_severe", "severe"]) {
      expect(AssessmentSeveritySchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects unknown severity", () => {
    expect(AssessmentSeveritySchema.safeParse("critical").success).toBe(false);
  });
});

describe("SubmitAssessmentSchema", () => {
  const validPayload = {
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    type: "phq9",
    answers: [0, 1, 2, 3, 0, 1, 2, 3, 0],
  };

  it("accepts valid PHQ-9 submission", () => {
    const result = SubmitAssessmentSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts valid submission with parentAssessmentId", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      type: "iss_sleep",
      answers: [0, 1, 2, 1, 0, 1, 2],
      parentAssessmentId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing sessionId (standalone assessments)", () => {
    const { sessionId, ...rest } = validPayload;
    const result = SubmitAssessmentSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid sessionId", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty answers array", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      answers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects answer values outside 0-3 range", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      answers: [0, 1, 4, 0, 0, 0, 0, 0, 0],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative answer values", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      answers: [-1, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer answer values", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      answers: [1.5, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.success).toBe(false);
  });

  it("does NOT accept totalScore from client (strips it)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      totalScore: 999,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).totalScore).toBeUndefined();
    }
  });

  it("does NOT accept severity from client (strips it)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      severity: "severe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).severity).toBeUndefined();
    }
  });

  it("rejects non-uuid parentAssessmentId", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      parentAssessmentId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts without parentAssessmentId (optional)", () => {
    const result = SubmitAssessmentSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentAssessmentId).toBeUndefined();
    }
  });

  it("rejects PHQ-9 with too few answers", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      answers: [0, 1, 2],
    });
    expect(result.success).toBe(false);
  });

  it("rejects PHQ-9 with too many answers", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      answers: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects GAD-7 with wrong answer count", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      type: "gad7",
      answers: [0, 1, 2, 3, 0],
    });
    expect(result.success).toBe(false);
  });

  it("accepts GAD-7 with exactly 7 answers", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      type: "gad7",
      answers: [0, 1, 2, 3, 0, 1, 2],
    });
    expect(result.success).toBe(true);
  });

  it("rejects trauma_gating with wrong answer count", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      type: "trauma_gating",
      answers: [0, 1, 2],
      parentAssessmentId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(false);
  });

  it("accepts trauma_gating with exactly 4 answers", () => {
    const result = SubmitAssessmentSchema.safeParse({
      ...validPayload,
      type: "trauma_gating",
      answers: [0, 1, 2, 3],
      parentAssessmentId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  // ── Wave 3 Validators ──────────────────────────────────────────

  it("accepts PSS with 10 answers (0-4 range)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "pss",
      answers: [0, 1, 2, 3, 4, 0, 1, 2, 3, 4],
    });
    expect(result.success).toBe(true);
  });

  it("rejects PSS with wrong answer count", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "pss",
      answers: [0, 1, 2],
    });
    expect(result.success).toBe(false);
  });

  it("accepts MSPSS with 12 answers (1-7 range)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "mspss",
      answers: [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5],
    });
    expect(result.success).toBe(true);
  });

  it("rejects MSPSS with value 0 (min is 1)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "mspss",
      answers: [0, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4],
    });
    expect(result.success).toBe(false);
  });

  it("accepts ECR with 36 answers (1-7 range)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "ecr",
      answers: Array(36).fill(4),
    });
    expect(result.success).toBe(true);
  });

  it("rejects ECR with wrong answer count", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "ecr",
      answers: Array(10).fill(4),
    });
    expect(result.success).toBe(false);
  });

  it("accepts PCL-5 with 20 answers (0-4 range)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "pcl5",
      answers: Array(20).fill(2),
    });
    expect(result.success).toBe(true);
  });

  it("rejects PCL-5 with value 5 (max is 4)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "pcl5",
      answers: [5, ...Array(19).fill(0)],
    });
    expect(result.success).toBe(false);
  });

  it("accepts ACE-IQ with 13 answers (0-1 range)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "ace_iq",
      answers: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    });
    expect(result.success).toBe(true);
  });

  it("rejects ACE-IQ with value 2 (max is 1)", () => {
    const result = SubmitAssessmentSchema.safeParse({
      type: "ace_iq",
      answers: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.success).toBe(false);
  });
});
