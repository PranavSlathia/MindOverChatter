import {
  TherapyPlanSchema,
  type AssessmentSummaryEntry,
  type AssessmentTrendEntry,
  type PatientUnderstandingItem,
  type SymptomTimelineEntry,
} from "@moc/shared";
import {
  ClinicalHandoffReportSchema,
  type ClinicalClassification,
  type ClinicalContradiction,
  type ClinicalHandoffReport,
  type ClinicalHypothesis,
  type ClinicalReportEntry,
  type ClinicalTriage,
} from "@moc/shared/validators/clinical-report";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  assessments,
  clinicalHandoffReports,
  reflections,
  sessions,
  therapyPlans,
} from "../db/schema/index.js";
import {
  generateAndPersistPatientUnderstanding,
  patientUnderstandingInternals,
} from "./patient-understanding-service.js";
import {
  buildClinicalClassifications,
  buildClinicalContradictions,
  buildClinicalTriage,
} from "./clinical-rules-service.js";

function groupByCategory(
  items: PatientUnderstandingItem[],
  category: PatientUnderstandingItem["category"],
): ClinicalReportEntry[] {
  return items
    .filter((item) => item.category === category)
    .slice(0, 8)
    .map((item) => ({
      label: item.title,
      detail: item.detail,
      confidence: item.confidence,
      provenance: item.provenance,
      evidenceRefs: item.sourceRefs,
    }));
}

function buildNarrative(input: {
  concerns: ClinicalReportEntry[];
  triggers: ClinicalReportEntry[];
  strengths: ClinicalReportEntry[];
  unansweredQuestions: ClinicalReportEntry[];
  triage: ClinicalTriage;
  classifications: ClinicalClassification[];
  contradictions: ClinicalContradiction[];
}): string {
  const concernText =
    input.concerns.length > 0
      ? input.concerns.slice(0, 2).map((entry) => entry.label).join("; ")
      : "the picture is still emerging";
  const triggerText =
    input.triggers.length > 0
      ? `Likely activators include ${input.triggers.slice(0, 2).map((entry) => entry.label).join(" and ")}.`
      : "No clear trigger pattern is fully corroborated yet.";
  const strengthText =
    input.strengths.length > 0
      ? `Protective factors already present include ${input.strengths.slice(0, 2).map((entry) => entry.label).join(" and ")}.`
      : "Protective factors should be explored further with the user.";
  const questionText =
    input.unansweredQuestions.length > 0
      ? `Open areas for a clinician to explore next include ${input.unansweredQuestions
          .slice(0, 2)
          .map((entry) => entry.label)
          .join(" and ")}.`
      : "Open questions are limited by current evidence.";
  const classificationText =
    input.classifications.length > 0
      ? `Provisional symptom clusters include ${input.classifications
          .slice(0, 2)
          .map((entry) => entry.label)
          .join(" and ")}.`
      : "No provisional symptom cluster has enough support yet.";
  const contradictionText =
    input.contradictions.length > 0
      ? "Some conclusions remain provisional because parts of the evidence conflict."
      : "";

  return `This handoff synthesizes the user's current longitudinal picture around ${concernText}. ${triggerText} ${strengthText} ${classificationText} Current triage priority is ${input.triage.priority}. ${questionText} ${contradictionText}`.trim();
}

export async function getLatestClinicalHandoffReport(
  userId: string,
): Promise<ClinicalHandoffReport | null> {
  const [row] = await db
    .select()
    .from(clinicalHandoffReports)
    .where(eq(clinicalHandoffReports.userId, userId))
    .orderBy(desc(clinicalHandoffReports.createdAt))
    .limit(1);

  if (!row) return null;

  const parsed = ClinicalHandoffReportSchema.safeParse(row.report);
  return parsed.success ? parsed.data : null;
}

export async function generateAndPersistClinicalHandoffReport(
  userId: string,
  reason: "session_end" | "reflection_submit" | "manual" = "manual",
): Promise<ClinicalHandoffReport> {
  const latestUnderstanding = await generateAndPersistPatientUnderstanding(userId, reason);

  const assessmentRows = await db
    .select({
      id: assessments.id,
      type: assessments.type,
      totalScore: assessments.totalScore,
      severity: assessments.severity,
      createdAt: assessments.createdAt,
    })
    .from(assessments)
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt));

  const reflectionCountRows = await db
    .select({
      id: reflections.id,
      status: reflections.status,
    })
    .from(reflections)
    .where(eq(reflections.userId, userId));

  const crisisSessions = await db
    .select({
      id: sessions.id,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, "crisis_escalated")))
    .orderBy(desc(sessions.startedAt));

  const [latestTherapyPlan] = await db
    .select({
      id: therapyPlans.id,
      plan: therapyPlans.plan,
      createdAt: therapyPlans.createdAt,
    })
    .from(therapyPlans)
    .where(eq(therapyPlans.userId, userId))
    .orderBy(desc(therapyPlans.createdAt))
    .limit(1);

  const concerns = groupByCategory(latestUnderstanding.items, "presenting_concern");
  const triggers = groupByCategory(latestUnderstanding.items, "trigger");
  const patterns = groupByCategory(latestUnderstanding.items, "perpetuating_pattern");
  const strengths = groupByCategory(latestUnderstanding.items, "protective_factor");
  const coping = groupByCategory(latestUnderstanding.items, "coping_strategy");
  const functionalImpact = groupByCategory(latestUnderstanding.items, "functional_impact");
  const unansweredQuestions = groupByCategory(latestUnderstanding.items, "unanswered_question");
  const riskFlags = groupByCategory(latestUnderstanding.items, "risk_factor");

  const assessmentByType = new Map<string, typeof assessmentRows>();
  for (const row of assessmentRows) {
    const existing = assessmentByType.get(row.type) ?? [];
    existing.push(row);
    assessmentByType.set(row.type, existing);
  }

  const assessmentLatest: AssessmentSummaryEntry[] = [];
  const assessmentTrends: AssessmentTrendEntry[] = [];
  for (const [type, rows] of assessmentByType) {
    const latest = rows[0];
    if (!latest) continue;
    assessmentLatest.push({
      type,
      latestSeverity: latest.severity,
      latestScore: latest.totalScore,
      latestAt: latest.createdAt.toISOString(),
    });
    assessmentTrends.push({
      type,
      direction: patientUnderstandingInternals.computeAssessmentTrend(rows),
    });
  }

  const symptomTimeline: SymptomTimelineEntry[] = [
    ...assessmentRows.slice(0, 12).map((row) => ({
      date: row.createdAt.toISOString(),
      label: `${row.type.toUpperCase()} screened as ${row.severity.replaceAll("_", " ")}`,
      sourceType: "assessment" as const,
      sourceId: row.id,
      severity: row.severity,
    })),
    ...crisisSessions.slice(0, 4).map((row) => ({
      date: row.startedAt.toISOString(),
      label: "Crisis escalation session",
      sourceType: "session" as const,
      sourceId: row.id,
      severity: "crisis",
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const parsedTherapyPlan = latestTherapyPlan
    ? TherapyPlanSchema.safeParse(latestTherapyPlan.plan)
    : null;
  const therapyPlan = parsedTherapyPlan?.success ? parsedTherapyPlan.data : null;

  const rawHypotheses = therapyPlan?.working_hypotheses ?? [];
  const narrativeSources = latestUnderstanding.items
    .flatMap((item) => item.sourceRefs)
    .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
    .map((ref) => ({
      sourceType: ref.sourceType,
      sourceId: ref.sourceId,
      createdAt: ref.createdAt ?? new Date(0).toISOString(),
      text: ref.excerpt ?? "",
    }))
    .filter((source) => source.text.trim().length > 0);
  const evaluatedHypotheses = latestTherapyPlan
    ? patientUnderstandingInternals.evaluateHypotheses({
        rawHypotheses,
        assessments: assessmentRows.map((row) => ({
          ...row,
          totalScore: row.totalScore ?? 0,
        })),
        narrativeSources,
        therapyPlanId: latestTherapyPlan.id,
        therapyPlanCreatedAt: latestTherapyPlan.createdAt,
      })
    : [];
  const openHypotheses: ClinicalHypothesis[] = evaluatedHypotheses.map((evaluation) => ({
    hypothesis: evaluation.hypothesis,
    confidence: evaluation.confidence,
    evidenceSummary: evaluation.evidence,
    evidenceRefs: evaluation.evidenceRefs,
    corroboratedBy: {
      assessmentCount: evaluation.assessmentCount,
      narrativeCount: evaluation.narrativeCount,
      contradictingCount: evaluation.contradictingCount,
    },
    status: evaluation.status,
  }));
  const unsupportedHypothesesSuppressed = openHypotheses.filter(
    (hypothesis) => hypothesis.status === "insufficient_evidence",
  ).length;

  const triage = buildClinicalTriage({
    assessments: assessmentRows,
    understandingItems: latestUnderstanding.items,
    crisisSessions,
  });
  const suspectedClassifications = buildClinicalClassifications({
    assessments: assessmentRows,
    understandingItems: latestUnderstanding.items,
  });
  const contradictions = buildClinicalContradictions({
    hypotheses: evaluatedHypotheses,
    assessments: assessmentRows,
  });

  const insufficientEvidenceSections = [
    concerns.length === 0 ? "presentingConcerns" : null,
    assessmentLatest.length === 0 ? "assessmentSummary" : null,
    functionalImpact.length === 0 ? "functionalImpact" : null,
    openHypotheses.filter((hypothesis) => hypothesis.status === "supported").length === 0
      ? "openHypotheses"
      : null,
  ].filter((value): value is string => Boolean(value));

  const reportCandidate: ClinicalHandoffReport = {
    id: crypto.randomUUID(),
    userId,
    sourceSnapshotId: latestUnderstanding.snapshot.id,
    createdAt: new Date().toISOString(),
    dataConfidence: latestUnderstanding.snapshot.dataConfidence,
    summary: {
      generatedFor: "clinician_handoff",
      narrative: buildNarrative({
        concerns,
        triggers,
        strengths,
        unansweredQuestions,
        triage,
        classifications: suspectedClassifications,
        contradictions,
      }),
      caution:
        "This report is clinician-facing decision support and not a diagnosis. Findings should be validated in direct human assessment.",
    },
    presentingConcerns: concerns,
    symptomTimeline,
    assessmentSummary: {
      latest: assessmentLatest,
      trends: assessmentTrends,
    },
    functionalImpact,
    triggers,
    perpetuatingPatterns: patterns,
    protectiveFactors: strengths,
    copingStrategies: coping,
    riskHistory: {
      crisisSessions: crisisSessions.length,
      safetyFlags: riskFlags,
      notes: riskFlags.length > 0
        ? ["Risk-relevant evidence exists and should be reviewed directly by a clinician."]
        : ["No safety-critical evidence met the report threshold at generation time."],
    },
    clinicalSignals: {
      triage,
      suspectedClassifications,
      contradictions,
    },
    openHypotheses,
    unansweredQuestions,
    evidenceCoverage: {
      understandingItems: latestUnderstanding.items.length,
      reflectionsIntegrated: reflectionCountRows.filter((row) => row.status === "integrated").length,
      unsupportedHypothesesSuppressed,
      hypothesisThreshold: patientUnderstandingInternals.HYPOTHESIS_THRESHOLD_TEXT,
      insufficientEvidenceSections,
    },
  };

  const report = ClinicalHandoffReportSchema.parse(reportCandidate);

  await db.insert(clinicalHandoffReports).values({
    userId,
    sourceSnapshotId: latestUnderstanding.snapshot.id,
    report,
    formatVersion: "1",
  });

  return report;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderClinicalHandoffReportText(report: ClinicalHandoffReport): string {
  const lines = [
    "MindOverChatter Clinical Handoff Report",
    "",
    `Generated: ${new Date(report.createdAt).toLocaleString()}`,
    "",
    "Summary",
    report.summary.narrative,
    "",
    "Presenting Concerns",
    ...(report.presentingConcerns.map((entry) => `- ${entry.label}: ${entry.detail}`) || ["- None yet"]),
    "",
    "Assessment Summary",
    ...(report.assessmentSummary.latest.map(
      (entry) => `- ${entry.type.toUpperCase()}: ${entry.latestSeverity} (score ${entry.latestScore ?? "n/a"})`,
    ) || ["- None yet"]),
    "",
    "Triggers",
    ...(report.triggers.map((entry) => `- ${entry.label}`) || ["- None yet"]),
    "",
    "Protective Factors",
    ...(report.protectiveFactors.map((entry) => `- ${entry.label}`) || ["- None yet"]),
    "",
    "Open Hypotheses",
    ...(report.openHypotheses.map(
      (entry) => `- ${entry.hypothesis} (confidence ${entry.confidence.toFixed(2)}): ${entry.evidenceSummary}`,
    ) || ["- None yet"]),
    "",
    "Unanswered Questions",
    ...(report.unansweredQuestions.map((entry) => `- ${entry.label}`) || ["- None yet"]),
    "",
    report.summary.caution,
  ];

  return lines.join("\n");
}

export function renderClinicalHandoffPdf(report: ClinicalHandoffReport): Uint8Array {
  const text = renderClinicalHandoffReportText(report);
  const rawLines = text.split("\n");
  const wrappedLines = rawLines.flatMap((line) =>
    line.length <= 92 ? [line] : line.match(/.{1,92}(\s|$)/g)?.map((part) => part.trimEnd()) ?? [line],
  );

  const lineHeight = 14;
  const pageHeight = 792;
  const topMargin = 52;
  const linesPerPage = Math.floor((pageHeight - topMargin * 2) / lineHeight);
  const pages: string[] = [];

  for (let pageIndex = 0; pageIndex * linesPerPage < wrappedLines.length; pageIndex++) {
    const pageLines = wrappedLines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage);
    const commands = [
      "BT",
      "/F1 11 Tf",
      `1 0 0 1 50 ${pageHeight - topMargin} Tm`,
      `${lineHeight} TL`,
    ];
    pageLines.forEach((line, idx) => {
      commands.push(`${idx === 0 ? "" : "T* " }(${escapePdfText(line)}) Tj`.trim());
    });
    commands.push("ET");
    pages.push(commands.join("\n"));
  }

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontObject = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  for (const page of pages) {
    const contentObjectId = addObject(
      `<< /Length ${Buffer.byteLength(page, "utf8")} >>\nstream\n${page}\nendstream`,
    );
    contentObjectIds.push(contentObjectId);
    pageObjectIds.push(0);
  }

  const kidsPlaceholder = "__KIDS__";
  const pagesObjectId = addObject(`<< /Type /Pages /Kids ${kidsPlaceholder} /Count ${pages.length} >>`);

  pageObjectIds.forEach((_, idx) => {
    pageObjectIds[idx] = addObject(
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 612 792] /Contents ${contentObjectIds[idx]} 0 R /Resources << /Font << /F1 ${fontObject} 0 R >> >> >>`,
    );
  });

  objects[pagesObjectId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, idx) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let idx = 1; idx < offsets.length; idx++) {
    pdf += `${String(offsets[idx]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function renderClinicalHandoffFhirBundle(report: ClinicalHandoffReport): Record<string, unknown> {
  const compositionId = `composition-${report.id}`;
  return {
    resourceType: "Bundle",
    type: "document",
    id: `handoff-${report.id}`,
    timestamp: report.createdAt,
    entry: [
      {
        resource: {
          resourceType: "Composition",
          id: compositionId,
          status: "final",
          type: {
            text: "Mental health clinician handoff report",
          },
          date: report.createdAt,
          title: "MindOverChatter Clinical Handoff Report",
          section: [
            {
              title: "Summary",
              text: {
                status: "generated",
                div: `<div><p>${report.summary.narrative}</p><p>${report.summary.caution}</p></div>`,
              },
            },
            {
              title: "Presenting concerns",
              text: {
                status: "generated",
                div: `<div><ul>${report.presentingConcerns.map((entry) => `<li>${entry.label}: ${entry.detail}</li>`).join("")}</ul></div>`,
              },
            },
            {
              title: "Open hypotheses",
              text: {
                status: "generated",
                div: `<div><ul>${report.openHypotheses.map((entry) => `<li>${entry.hypothesis}: ${entry.evidenceSummary}</li>`).join("")}</ul></div>`,
              },
            },
          ],
        },
      },
      ...report.assessmentSummary.latest.map((entry) => ({
        resource: {
          resourceType: "Observation",
          id: `assessment-${entry.type}-${entry.latestAt}`,
          status: "final",
          code: { text: entry.type.toUpperCase() },
          effectiveDateTime: entry.latestAt,
          valueString: `${entry.latestSeverity}${entry.latestScore != null ? ` (score ${entry.latestScore})` : ""}`,
        },
      })),
      ...report.openHypotheses.map((entry, idx) => ({
        resource: {
          resourceType: "Condition",
          id: `hypothesis-${idx + 1}`,
          clinicalStatus: { text: "active" },
          verificationStatus: {
            text: entry.status === "supported" ? "provisional" : "unconfirmed",
          },
          code: { text: entry.hypothesis },
          note: [{ text: entry.evidenceSummary }],
        },
      })),
    ],
  };
}
