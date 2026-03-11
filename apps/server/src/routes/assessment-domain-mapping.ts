// ── Assessment Domain Mapping, Correlation & Trends ─────────────
// Pure functions — no DB, no side effects. Testable in isolation.
// Maps assessment results to 6 wellness domains algorithmically.

import type { AssessmentType, AssessmentSeverity } from "@moc/shared";
import {
  dass21Subscales,
  rosenbergScore,
  uclaScore,
  copenhagenBurnoutAvg,
  pssScore,
  mspssSubscales,
  ecrSubscales,
  pcl5Subscales,
} from "./assessment-scoring.js";

// ── Types ────────────────────────────────────────────────────────

export type DomainKey = "connection" | "momentum" | "groundedness" | "meaning" | "self_regard" | "vitality";

export interface DomainContribution {
  domain: DomainKey;
  normalizedScore: number; // 0-1, 0=best, 1=worst
  weight: number;
  source: { assessmentType: string; subscale?: string; rawScore: number; maxScore: number };
}

export interface ComputedDomainSignal {
  domain: DomainKey;
  level: "low" | "medium" | "high";
  score: number; // weighted average 0-1
  contributions: DomainContribution[];
  confidence: number; // based on # contributing instruments
}

export interface CorrelationResult {
  constructName: string;
  instruments: Array<{ type: string; subscale?: string; normalizedScore: number }>;
  convergence: "converging" | "diverging" | "insufficient_data";
  divergenceDetail?: string;
}

export interface DomainTrend {
  domain: DomainKey;
  currentLevel: "low" | "medium" | "high";
  previousLevel: "low" | "medium" | "high" | null;
  trend: "improving" | "stable" | "declining";
  dataPoints: number;
  periodDays: number;
}

// ── Assessment Input ─────────────────────────────────────────────

export interface AssessmentInput {
  type: AssessmentType;
  answers: number[];
  totalScore: number;
  severity: AssessmentSeverity;
  createdAt: Date;
}

// ── Domain Mapping Table ─────────────────────────────────────────

interface MappingRule {
  assessmentType: AssessmentType;
  subscale?: string;
  domain: DomainKey;
  weight: number;
  /** If true, normalize as 1 - (raw/max) so higher raw = lower severity */
  inverted?: boolean;
  /** Extractor function to get the subscale raw score */
  extract: (a: AssessmentInput) => { rawScore: number; maxScore: number } | null;
}

const MAPPING_RULES: MappingRule[] = [
  // PHQ-9 → vitality + momentum
  { assessmentType: "phq9", domain: "vitality", weight: 0.9,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 27 }) },
  { assessmentType: "phq9", domain: "momentum", weight: 0.6,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 27 }) },

  // GAD-7 → groundedness
  { assessmentType: "gad7", domain: "groundedness", weight: 0.9,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 21 }) },

  // DASS-21 subscales
  { assessmentType: "dass21", subscale: "depression", domain: "vitality", weight: 0.8,
    extract: (a) => ({ rawScore: dass21Subscales(a.answers).depression, maxScore: 42 }) },
  { assessmentType: "dass21", subscale: "anxiety", domain: "groundedness", weight: 0.8,
    extract: (a) => ({ rawScore: dass21Subscales(a.answers).anxiety, maxScore: 42 }) },
  { assessmentType: "dass21", subscale: "stress", domain: "momentum", weight: 0.7,
    extract: (a) => ({ rawScore: dass21Subscales(a.answers).stress, maxScore: 42 }) },

  // WHO-5 (inverted: higher raw = better wellbeing)
  { assessmentType: "who5", domain: "vitality", weight: 0.8, inverted: true,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 25 }) },

  // Rosenberg SE (inverted: higher raw = better self-esteem)
  { assessmentType: "rosenberg_se", domain: "self_regard", weight: 0.9, inverted: true,
    extract: (a) => ({ rawScore: rosenbergScore(a.answers), maxScore: 30 }) },

  // PSS → groundedness
  { assessmentType: "pss", domain: "groundedness", weight: 0.7,
    extract: (a) => ({ rawScore: pssScore(a.answers), maxScore: 40 }) },

  // MSPSS (inverted: higher = better support)
  { assessmentType: "mspss", domain: "connection", weight: 0.8, inverted: true,
    extract: (a) => ({ rawScore: mspssSubscales(a.answers).overall, maxScore: 7 }) },

  // ECR subscales
  { assessmentType: "ecr", subscale: "avoidance", domain: "connection", weight: 0.7,
    extract: (a) => {
      const sub = ecrSubscales(a.answers);
      return { rawScore: sub.avoidance, maxScore: 7 };
    }},
  { assessmentType: "ecr", subscale: "anxiety", domain: "groundedness", weight: 0.5,
    extract: (a) => {
      const sub = ecrSubscales(a.answers);
      return { rawScore: sub.anxiety, maxScore: 7 };
    }},

  // UCLA Loneliness
  { assessmentType: "ucla_loneliness", domain: "connection", weight: 0.9,
    extract: (a) => ({ rawScore: uclaScore(a.answers), maxScore: 80 }) },

  // PCL-5
  { assessmentType: "pcl5", domain: "groundedness", weight: 0.8,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 80 }) },
  { assessmentType: "pcl5", subscale: "negativeCognitions", domain: "meaning", weight: 0.5,
    extract: (a) => ({ rawScore: pcl5Subscales(a.answers).negativeCognitions, maxScore: 28 }) },

  // Copenhagen Burnout
  { assessmentType: "copenhagen_burnout", subscale: "personal", domain: "momentum", weight: 0.8,
    extract: (a) => ({ rawScore: copenhagenBurnoutAvg(a.answers, 0, 6), maxScore: 100 }) },
  { assessmentType: "copenhagen_burnout", subscale: "work", domain: "momentum", weight: 0.6,
    extract: (a) => ({ rawScore: copenhagenBurnoutAvg(a.answers, 6, 13), maxScore: 100 }) },

  // ISI → vitality
  { assessmentType: "isi", domain: "vitality", weight: 0.7,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 28 }) },

  // ACE / ACE-IQ → meaning + groundedness
  { assessmentType: "ace_score", domain: "meaning", weight: 0.5,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 10 }) },
  { assessmentType: "ace_score", domain: "groundedness", weight: 0.4,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 10 }) },
  { assessmentType: "ace_iq", domain: "meaning", weight: 0.5,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 13 }) },
  { assessmentType: "ace_iq", domain: "groundedness", weight: 0.4,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 13 }) },

  // PHQ-4 → vitality + groundedness
  { assessmentType: "phq4", domain: "vitality", weight: 0.5,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 12 }) },
  { assessmentType: "phq4", domain: "groundedness", weight: 0.5,
    extract: (a) => ({ rawScore: a.totalScore, maxScore: 12 }) },
];

// ── B1: Domain Signal Computation ────────────────────────────────

function normalize(rawScore: number, maxScore: number, inverted: boolean): number {
  if (maxScore === 0) return 0;
  const ratio = Math.max(0, Math.min(1, rawScore / maxScore));
  return inverted ? 1 - ratio : ratio;
}

function scoreToLevel(score: number): "low" | "medium" | "high" {
  if (score <= 0.33) return "low";
  if (score <= 0.66) return "medium";
  return "high";
}

/**
 * Compute domain signals from the latest set of assessments.
 * Takes one assessment per type (the most recent).
 */
export function computeDomainSignals(latestAssessments: AssessmentInput[]): ComputedDomainSignal[] {
  // Index by type for fast lookup
  const byType = new Map<AssessmentType, AssessmentInput>();
  for (const a of latestAssessments) {
    byType.set(a.type, a);
  }

  // Collect contributions per domain
  const domainContributions = new Map<DomainKey, DomainContribution[]>();
  const ALL_DOMAINS: DomainKey[] = ["connection", "momentum", "groundedness", "meaning", "self_regard", "vitality"];
  for (const d of ALL_DOMAINS) {
    domainContributions.set(d, []);
  }

  for (const rule of MAPPING_RULES) {
    const assessment = byType.get(rule.assessmentType);
    if (!assessment) continue;

    const extracted = rule.extract(assessment);
    if (!extracted) continue;

    const normalizedScore = normalize(extracted.rawScore, extracted.maxScore, rule.inverted ?? false);

    domainContributions.get(rule.domain)!.push({
      domain: rule.domain,
      normalizedScore,
      weight: rule.weight,
      source: {
        assessmentType: rule.assessmentType,
        subscale: rule.subscale,
        rawScore: extracted.rawScore,
        maxScore: extracted.maxScore,
      },
    });
  }

  // Compute weighted averages
  const signals: ComputedDomainSignal[] = [];
  for (const domain of ALL_DOMAINS) {
    const contributions = domainContributions.get(domain)!;
    if (contributions.length === 0) continue;

    const totalWeight = contributions.reduce((s, c) => s + c.weight, 0);
    const weightedSum = contributions.reduce((s, c) => s + c.normalizedScore * c.weight, 0);
    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Confidence: 1 instrument = 0.3, 2 = 0.6, 3+ = 0.9
    const uniqueInstruments = new Set(contributions.map((c) => c.source.assessmentType)).size;
    const confidence = Math.min(0.9, uniqueInstruments * 0.3);

    signals.push({
      domain,
      level: scoreToLevel(score),
      score: Math.round(score * 1000) / 1000,
      contributions,
      confidence,
    });
  }

  return signals;
}

// ── B2: Cross-Instrument Correlation ─────────────────────────────

interface ConstructGroup {
  name: string;
  members: Array<{
    assessmentType: AssessmentType;
    subscale?: string;
    extract: (a: AssessmentInput) => number; // normalized 0-1
  }>;
}

const CONSTRUCT_GROUPS: ConstructGroup[] = [
  {
    name: "Depression",
    members: [
      { assessmentType: "phq9", extract: (a) => a.totalScore / 27 },
      { assessmentType: "dass21", subscale: "depression",
        extract: (a) => dass21Subscales(a.answers).depression / 42 },
    ],
  },
  {
    name: "Anxiety",
    members: [
      { assessmentType: "gad7", extract: (a) => a.totalScore / 21 },
      { assessmentType: "dass21", subscale: "anxiety",
        extract: (a) => dass21Subscales(a.answers).anxiety / 42 },
    ],
  },
  {
    name: "Connection",
    members: [
      { assessmentType: "ucla_loneliness", extract: (a) => uclaScore(a.answers) / 80 },
      { assessmentType: "mspss", extract: (a) => 1 - mspssSubscales(a.answers).overall / 7 },
      { assessmentType: "ecr", subscale: "avoidance",
        extract: (a) => (ecrSubscales(a.answers).avoidance - 1) / 6 },
    ],
  },
  {
    name: "Stress/Burnout",
    members: [
      { assessmentType: "pss", extract: (a) => pssScore(a.answers) / 40 },
      { assessmentType: "copenhagen_burnout", subscale: "personal",
        extract: (a) => copenhagenBurnoutAvg(a.answers, 0, 6) / 100 },
    ],
  },
];

export function detectCorrelations(latestAssessments: AssessmentInput[]): CorrelationResult[] {
  const byType = new Map<AssessmentType, AssessmentInput>();
  for (const a of latestAssessments) {
    byType.set(a.type, a);
  }

  const results: CorrelationResult[] = [];

  for (const group of CONSTRUCT_GROUPS) {
    const instruments: Array<{ type: string; subscale?: string; normalizedScore: number }> = [];

    for (const member of group.members) {
      const assessment = byType.get(member.assessmentType);
      if (!assessment) continue;
      instruments.push({
        type: member.assessmentType,
        subscale: member.subscale,
        normalizedScore: Math.round(member.extract(assessment) * 1000) / 1000,
      });
    }

    if (instruments.length < 2) {
      results.push({
        constructName: group.name,
        instruments,
        convergence: "insufficient_data",
      });
      continue;
    }

    // Check pairwise divergence
    const scores = instruments.map((i) => i.normalizedScore);
    const maxDiff = Math.max(...scores) - Math.min(...scores);

    if (maxDiff <= 0.15) {
      results.push({ constructName: group.name, instruments, convergence: "converging" });
    } else if (maxDiff > 0.3) {
      const highest = instruments.reduce((a, b) => (a.normalizedScore > b.normalizedScore ? a : b));
      const lowest = instruments.reduce((a, b) => (a.normalizedScore < b.normalizedScore ? a : b));
      results.push({
        constructName: group.name,
        instruments,
        convergence: "diverging",
        divergenceDetail: `${highest.type}${highest.subscale ? `.${highest.subscale}` : ""} (${highest.normalizedScore}) diverges from ${lowest.type}${lowest.subscale ? `.${lowest.subscale}` : ""} (${lowest.normalizedScore})`,
      });
    } else {
      results.push({ constructName: group.name, instruments, convergence: "converging" });
    }
  }

  return results;
}

// ── B3: Longitudinal Domain Trends ───────────────────────────────

/**
 * Compute domain trends from ALL assessments (not just latest).
 * Uses a half-split comparison: older half vs recent half.
 */
export function computeDomainTrends(allAssessments: AssessmentInput[]): DomainTrend[] {
  if (allAssessments.length === 0) return [];

  // Sort by date ascending
  const sorted = [...allAssessments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const earliest = sorted[0]!.createdAt;
  const latest = sorted[sorted.length - 1]!.createdAt;
  const periodDays = Math.max(1, Math.round((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)));

  // Split into older and recent halves
  const mid = Math.floor(sorted.length / 2);
  const olderHalf = sorted.slice(0, mid);
  const recentHalf = sorted.slice(mid);

  // Need at least 1 in each half for a meaningful trend
  if (olderHalf.length === 0 || recentHalf.length === 0) {
    // Single data point — compute current signals only
    const currentSignals = computeDomainSignals(sorted);
    return currentSignals.map((s) => ({
      domain: s.domain,
      currentLevel: s.level,
      previousLevel: null,
      trend: "stable" as const,
      dataPoints: sorted.length,
      periodDays,
    }));
  }

  // Deduplicate each half to latest per type
  const dedup = (items: AssessmentInput[]) => {
    const map = new Map<AssessmentType, AssessmentInput>();
    for (const item of items) {
      const existing = map.get(item.type);
      if (!existing || item.createdAt.getTime() > existing.createdAt.getTime()) {
        map.set(item.type, item);
      }
    }
    return [...map.values()];
  };

  const olderSignals = computeDomainSignals(dedup(olderHalf));
  const currentSignals = computeDomainSignals(dedup(recentHalf));

  const olderMap = new Map(olderSignals.map((s) => [s.domain, s]));
  const currentMap = new Map(currentSignals.map((s) => [s.domain, s]));

  const ALL_DOMAINS: DomainKey[] = ["connection", "momentum", "groundedness", "meaning", "self_regard", "vitality"];
  const trends: DomainTrend[] = [];

  for (const domain of ALL_DOMAINS) {
    const current = currentMap.get(domain);
    const previous = olderMap.get(domain);

    if (!current) continue;

    let trend: "improving" | "stable" | "declining" = "stable";
    if (previous) {
      const diff = current.score - previous.score;
      // Lower score = better (0=best, 1=worst), so negative diff = improving
      if (diff < -0.1) trend = "improving";
      else if (diff > 0.1) trend = "declining";
    }

    trends.push({
      domain,
      currentLevel: current.level,
      previousLevel: previous?.level ?? null,
      trend,
      dataPoints: sorted.length,
      periodDays,
    });
  }

  return trends;
}
