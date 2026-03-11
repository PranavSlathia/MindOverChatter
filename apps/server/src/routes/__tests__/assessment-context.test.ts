import { describe, expect, it } from "vitest";
import { buildAssessmentContextBlock, buildFormulationText } from "../assessment-context.js";
import type { AssessmentType, AssessmentSeverity } from "@moc/shared";

// ── buildAssessmentContextBlock ────────────────────────────────────

describe("buildAssessmentContextBlock", () => {
  it("produces a context block for PHQ-9 moderate with next screener", () => {
    const block = buildAssessmentContextBlock("phq9", "moderate", "iss_sleep");
    expect(block).toContain("PHQ-9 mood check-in");
    expect(block).toContain("a moderate level of difficulty");
    expect(block).toContain("sleep quality screening");
    expect(block).toContain("follow-up");
  });

  it("produces a context block for GAD-7 minimal with no next screener", () => {
    const block = buildAssessmentContextBlock("gad7", "minimal", null);
    expect(block).toContain("GAD-7 anxiety check-in");
    expect(block).toContain("a minimal level of difficulty");
    expect(block).toContain("No further screenings");
    expect(block).not.toContain("follow-up");
  });

  it("NEVER contains raw numeric scores", () => {
    // Test all severity levels — none should produce numbers that look like scores.
    // Numbers that are part of assessment names (PHQ-9, GAD-7) are acceptable
    // since they are standardized instrument names, not user scores.
    const severities: AssessmentSeverity[] = [
      "minimal",
      "mild",
      "moderate",
      "moderately_severe",
      "severe",
    ];
    for (const sev of severities) {
      const block = buildAssessmentContextBlock("phq9", sev, null);
      // Strip known assessment instrument names before checking for raw numbers
      const stripped = block.replace(/PHQ-9|GAD-7/g, "");
      expect(stripped).not.toMatch(/\b\d+\b/);
    }
  });

  it("NEVER contains raw enum values as bare terms", () => {
    const block = buildAssessmentContextBlock("phq9", "moderately_severe", "panic_screener");
    // Should use human-readable descriptions, not raw enum values
    expect(block).not.toContain("moderately_severe");
    expect(block).not.toContain("panic_screener");
    // But should contain the human-readable versions
    expect(block).toContain("moderately significant level of difficulty");
    expect(block).toContain("panic and worry screening");
  });

  it("uses human-readable labels for all assessment types", () => {
    const expectedLabels: Partial<Record<AssessmentType, string>> = {
      phq9: "PHQ-9 mood check-in",
      gad7: "GAD-7 anxiety check-in",
      iss_sleep: "sleep quality screening",
      panic_screener: "panic and worry screening",
      trauma_gating: "stress and difficult experiences screening",
      functioning: "daily functioning screening",
      substance_use: "substance use screening",
      relationship: "relationship wellbeing screening",
      dass21: "DASS-21 emotional health check-in",
      rosenberg_se: "self-esteem check-in",
      who5: "WHO-5 wellbeing check-in",
      phq4: "PHQ-4 brief mood and anxiety check-in",
      pc_ptsd5: "stress response screening",
      ipip_big5: "personality traits exploration",
      ucla_loneliness: "social connectedness check-in",
      copenhagen_burnout: "burnout and energy check-in",
      ace_score: "early life experiences reflection",
      isi: "sleep and insomnia check-in",
      harrower_inkblot: "perceptual style exploration",
      // Wave 3
      pss: "perceived stress check-in",
      mspss: "social support check-in",
      ecr: "relationship patterns exploration",
      pcl5: "trauma response check-in",
      ace_iq: "expanded early life experiences reflection",
    };

    for (const [t, label] of Object.entries(expectedLabels)) {
      const block = buildAssessmentContextBlock(t as AssessmentType, "moderate", null);
      expect(block).toContain(label);
    }
  });

  it("uses human-readable descriptions for all severity levels", () => {
    const severities: AssessmentSeverity[] = [
      "minimal",
      "mild",
      "moderate",
      "moderately_severe",
      "severe",
    ];

    const expectedDescriptions: Record<AssessmentSeverity, string> = {
      minimal: "a minimal level of difficulty",
      mild: "a mild level of difficulty",
      moderate: "a moderate level of difficulty",
      moderately_severe: "a moderately significant level of difficulty",
      severe: "a significant level of difficulty",
    };

    for (const sev of severities) {
      const block = buildAssessmentContextBlock("phq9", sev, null);
      expect(block).toContain(expectedDescriptions[sev]);
    }
  });

  it("includes gentle acknowledgement instruction", () => {
    const block = buildAssessmentContextBlock("phq9", "moderate", null);
    expect(block).toContain("gently and naturally");
    expect(block).toContain("without repeating specific scores");
  });

  it("ECR uses personality framing (no severity)", () => {
    const block = buildAssessmentContextBlock("ecr", "minimal", null);
    expect(block).toContain("relationship patterns exploration");
    expect(block).toContain("self-understanding");
    expect(block).not.toContain("level of difficulty");
  });

  it("ace_iq uses sensitive ACE framing", () => {
    const block = buildAssessmentContextBlock("ace_iq", "moderate", null);
    expect(block).toContain("expanded early life experiences reflection");
    expect(block).toContain("childhood experiences");
    expect(block).not.toContain("level of difficulty");
  });

  it("PSS uses normal severity framing", () => {
    const block = buildAssessmentContextBlock("pss", "moderate", null);
    expect(block).toContain("perceived stress check-in");
    expect(block).toContain("a moderate level of difficulty");
  });

  it("MSPSS uses normal severity framing", () => {
    const block = buildAssessmentContextBlock("mspss", "severe", null);
    expect(block).toContain("social support check-in");
    expect(block).toContain("a significant level of difficulty");
  });

  it("PCL-5 uses normal severity framing", () => {
    const block = buildAssessmentContextBlock("pcl5", "mild", null);
    expect(block).toContain("trauma response check-in");
    expect(block).toContain("a mild level of difficulty");
  });
});

// ── buildFormulationText ───────────────────────────────────────────

describe("buildFormulationText", () => {
  it("produces formulation text for PHQ-9 moderate with next screener", () => {
    const text = buildFormulationText("phq9", "moderate", "iss_sleep");
    expect(text).toContain("Internal formulation");
    expect(text).toContain("PHQ-9 mood check-in");
    expect(text).toContain("Severity: a moderate level of difficulty");
    expect(text).toContain("sleep quality screening recommended");
  });

  it("produces formulation text without next screener when null", () => {
    const text = buildFormulationText("gad7", "mild", null);
    expect(text).toContain("Internal formulation");
    expect(text).toContain("GAD-7 anxiety check-in");
    expect(text).toContain("Severity: a mild level of difficulty");
    expect(text).not.toContain("recommended");
  });

  it("NEVER contains raw numeric scores", () => {
    const severities: AssessmentSeverity[] = [
      "minimal",
      "mild",
      "moderate",
      "moderately_severe",
      "severe",
    ];
    for (const sev of severities) {
      const text = buildFormulationText("phq9", sev, null);
      // Strip known assessment instrument names before checking for raw numbers
      const stripped = text.replace(/PHQ-9|GAD-7/g, "");
      expect(stripped).not.toMatch(/\b\d+\b/);
    }
  });

  it("uses human-readable type labels, not raw enum values in descriptions", () => {
    const text = buildFormulationText("iss_sleep", "moderate", null);
    expect(text).toContain("sleep quality screening");
    // iss_sleep should not appear as a bare term (though it may as part of a label lookup)
    expect(text).not.toContain("iss_sleep");
  });

  it("includes next screener label when provided", () => {
    const text = buildFormulationText("phq9", "severe", "panic_screener");
    expect(text).toContain("panic and worry screening recommended");
    expect(text).not.toContain("panic_screener");
  });
});
