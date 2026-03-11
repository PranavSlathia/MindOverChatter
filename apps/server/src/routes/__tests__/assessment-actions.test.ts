import { describe, expect, it } from "vitest";
import { computeActionRecommendations, type ActionRecommendation } from "../assessment-actions.js";
import type { ComputedDomainSignal, CorrelationResult, DomainTrend, AssessmentInput } from "../assessment-domain-mapping.js";

// ── Helpers ──────────────────────────────────────────────────────

function makeSignal(domain: string, level: string, score = 0.5): ComputedDomainSignal {
  return {
    domain: domain as any,
    level: level as any,
    score,
    contributions: [],
    confidence: 0.6,
  };
}

function makeCorrelation(name: string, convergence: string): CorrelationResult {
  return {
    constructName: name,
    instruments: [],
    convergence: convergence as any,
  };
}

function makeTrend(domain: string, trend: string, previous?: string): DomainTrend {
  return {
    domain: domain as any,
    currentLevel: "medium" as any,
    previousLevel: (previous ?? "medium") as any,
    trend: trend as any,
    dataPoints: 4,
    periodDays: 30,
  };
}

function makeAssessment(type: string, severity: string, answers?: number[]): AssessmentInput {
  return {
    type: type as any,
    answers: answers ?? [],
    totalScore: 15,
    severity: severity as any,
    createdAt: new Date("2026-03-01"),
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("computeActionRecommendations", () => {
  it("returns empty array when no conditions met", () => {
    const actions = computeActionRecommendations(
      [makeSignal("vitality", "low"), makeSignal("connection", "low")],
      [],
      [],
      [],
    );
    expect(actions.length).toBe(0);
  });

  it("Rule 1: sleep-vitality fires when vitality high + ISI moderate + PHQ-9 moderate", () => {
    const actions = computeActionRecommendations(
      [makeSignal("vitality", "high")],
      [],
      [],
      [makeAssessment("isi", "moderate"), makeAssessment("phq9", "moderate")],
    );
    const sleepAction = actions.find((a) => a.id === "sleep-vitality");
    expect(sleepAction).toBeDefined();
    expect(sleepAction!.priority).toBe("high");
    expect(sleepAction!.domain).toBe("vitality");
  });

  it("Rule 1: does NOT fire when ISI is minimal", () => {
    const actions = computeActionRecommendations(
      [makeSignal("vitality", "high")],
      [],
      [],
      [makeAssessment("isi", "minimal"), makeAssessment("phq9", "moderate")],
    );
    expect(actions.find((a) => a.id === "sleep-vitality")).toBeUndefined();
  });

  it("Rule 2: connection-attachment fires when connection high + UCLA moderate", () => {
    const actions = computeActionRecommendations(
      [makeSignal("connection", "high")],
      [],
      [],
      [
        makeAssessment("ucla_loneliness", "moderate"),
        makeAssessment("mspss", "severe"), // low support
      ],
    );
    const connectionAction = actions.find((a) => a.id === "connection-attachment");
    expect(connectionAction).toBeDefined();
    expect(connectionAction!.priority).toBe("medium");
  });

  it("Rule 3: burnout-momentum fires when momentum declining + Copenhagen moderate", () => {
    const actions = computeActionRecommendations(
      [],
      [],
      [makeTrend("momentum", "declining")],
      [makeAssessment("copenhagen_burnout", "moderate")],
    );
    const burnoutAction = actions.find((a) => a.id === "burnout-momentum");
    expect(burnoutAction).toBeDefined();
    expect(burnoutAction!.priority).toBe("high");
  });

  it("Rule 4: comorbidity fires when vitality + groundedness high and convergent", () => {
    const actions = computeActionRecommendations(
      [makeSignal("vitality", "high"), makeSignal("groundedness", "high")],
      [makeCorrelation("Depression", "converging"), makeCorrelation("Anxiety", "converging")],
      [],
      [],
    );
    const comorbidityAction = actions.find((a) => a.id === "comorbidity-integrated");
    expect(comorbidityAction).toBeDefined();
    expect(comorbidityAction!.priority).toBe("medium");
  });

  it("Rule 5: self-regard fires when severe + other domains struggling", () => {
    const actions = computeActionRecommendations(
      [
        makeSignal("self_regard", "high"),
        makeSignal("vitality", "high"),
        makeSignal("connection", "high"),
      ],
      [],
      [],
      [makeAssessment("rosenberg_se", "severe")],
    );
    const selfAction = actions.find((a) => a.id === "self-regard-foundation");
    expect(selfAction).toBeDefined();
    expect(selfAction!.priority).toBe("high");
  });

  it("Rule 6: improving reinforcement fires for improving trends", () => {
    const actions = computeActionRecommendations(
      [],
      [],
      [makeTrend("vitality", "improving", "high")],
      [],
    );
    const improvingAction = actions.find((a) => a.id === "improving-vitality");
    expect(improvingAction).toBeDefined();
    expect(improvingAction!.priority).toBe("low");
  });

  it("sorts by priority (high > medium > low)", () => {
    const actions = computeActionRecommendations(
      [
        makeSignal("vitality", "high"),
        makeSignal("groundedness", "high"),
      ],
      [makeCorrelation("Depression", "converging"), makeCorrelation("Anxiety", "converging")],
      [makeTrend("vitality", "improving", "high")],
      [makeAssessment("isi", "moderate"), makeAssessment("phq9", "moderate")],
    );

    if (actions.length >= 2) {
      const priorities = actions.map((a) => a.priority);
      const order = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i]!]).toBeGreaterThanOrEqual(order[priorities[i - 1]!]);
      }
    }
  });
});
