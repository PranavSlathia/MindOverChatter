import { useEffect, useState } from "react";
import { api, type ClinicalHandoffReport } from "@/lib/api.js";

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-foreground/10 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function EvidenceRefsList({
  refs,
}: {
  refs: Array<{
    sourceType: string;
    sourceId: string;
    excerpt?: string | null;
    createdAt?: string | null;
  }>;
}) {
  if (refs.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {refs.slice(0, 4).map((ref) => (
        <span
          key={`${ref.sourceType}-${ref.sourceId}-${ref.createdAt ?? "na"}`}
          className="rounded-full bg-white px-2.5 py-1 text-[11px] text-foreground/50 ring-1 ring-foreground/8"
          title={ref.excerpt ?? undefined}
        >
          {ref.sourceType.replaceAll("_", " ")}
          {ref.excerpt ? ` • ${ref.excerpt.slice(0, 48)}` : ""}
        </span>
      ))}
    </div>
  );
}

function EntryList({
  entries,
  emptyLabel,
}: {
  entries: Array<{
    label: string;
    detail: string;
    confidence: number;
    provenance?: string;
    evidenceRefs?: Array<{
      sourceType: string;
      sourceId: string;
      excerpt?: string | null;
      createdAt?: string | null;
    }>;
  }>;
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-foreground/45">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={`${entry.label}-${entry.detail}`} className="rounded-lg bg-foreground/[0.03] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{entry.label}</p>
              {entry.provenance && (
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-foreground/35">
                  {entry.provenance.replaceAll("_", " ")}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-foreground/35">{(entry.confidence * 100).toFixed(0)}%</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground/65">{entry.detail}</p>
          {entry.evidenceRefs && <EvidenceRefsList refs={entry.evidenceRefs} />}
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const [report, setReport] = useState<ClinicalHandoffReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setIsLoading(true);
      setError(null);
      try {
        const nextReport = await api.getLatestClinicalHandoffReport();
        if (!cancelled) {
          setReport(nextReport);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshReport() {
    setIsRefreshing(true);
    setError(null);
    try {
      const nextReport = await api.generateClinicalHandoffReport();
      setReport(nextReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh report");
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-xl border border-foreground/10 bg-white p-6 shadow-sm">
          <p className="text-sm text-foreground/50">Generating clinician handoff report...</p>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
            Clinician Handoff
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">No report generated yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/65">
            Generate the first clinician-facing handoff from the current evidence in sessions,
            assessments, formulations, and reflections.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void refreshReport()}
              disabled={isRefreshing}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isRefreshing ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/40">
              Clinician Handoff
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">Therapist-ready summary</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/65">
              {report.summary.narrative}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshReport()}
              disabled={isRefreshing}
              className="rounded-lg border border-foreground/15 px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <a
              href={api.getClinicalHandoffPdfUrl()}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-foreground/15 px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5"
            >
              PDF
            </a>
            <a
              href={api.getClinicalHandoffFhirUrl()}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-foreground/15 px-3 py-2 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5"
            >
              FHIR JSON
            </a>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900/80">
          {report.summary.caution}
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}
      </section>

      <ReportSection title="Clinical Signals">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-foreground/[0.03] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/35">
              Triage
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {report.clinicalSignals.triage.priority.replaceAll("_", " ")}
            </p>
            <div className="mt-3 space-y-2">
              {report.clinicalSignals.triage.reasons.map((reason) => (
                <p key={reason} className="text-sm leading-relaxed text-foreground/65">
                  {reason}
                </p>
              ))}
            </div>
            <EvidenceRefsList refs={report.clinicalSignals.triage.evidenceRefs} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Provisional Classifications</h3>
            {report.clinicalSignals.suspectedClassifications.length === 0 ? (
              <p className="text-sm text-foreground/45">No structured classification cluster is ready yet.</p>
            ) : (
              <div className="space-y-3">
                {report.clinicalSignals.suspectedClassifications.map((entry) => (
                  <div key={`${entry.system}-${entry.label}`} className="rounded-lg bg-foreground/[0.03] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.label}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-foreground/35">
                          {entry.system.replaceAll("_", " ")}
                          {entry.code ? ` • ${entry.code}` : ""}
                        </p>
                      </div>
                      <span className="text-[11px] text-foreground/35">
                        {(entry.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/65">{entry.rationale}</p>
                    <EvidenceRefsList refs={entry.evidenceRefs} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Presenting Concerns">
        <EntryList entries={report.presentingConcerns} emptyLabel="No presenting concerns met the evidence threshold yet." />
      </ReportSection>

      <ReportSection title="Symptom Timeline">
        {report.symptomTimeline.length === 0 ? (
          <p className="text-sm text-foreground/45">No timeline evidence yet.</p>
        ) : (
          <div className="space-y-3">
            {report.symptomTimeline.map((entry) => (
              <div key={`${entry.sourceType}-${entry.sourceId}-${entry.date}`} className="rounded-lg bg-foreground/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{entry.label}</p>
                  <span className="text-[11px] text-foreground/35">
                    {new Date(entry.date).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-foreground/35">
                  {entry.sourceType.replaceAll("_", " ")}
                  {entry.severity ? ` • ${entry.severity.replaceAll("_", " ")}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Assessment Summary">
        {report.assessmentSummary.latest.length === 0 ? (
          <p className="text-sm text-foreground/45">No assessments completed yet.</p>
        ) : (
          <div className="space-y-3">
            {report.assessmentSummary.latest.map((entry) => (
              <div key={`${entry.type}-${entry.latestAt}`} className="rounded-lg bg-foreground/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{entry.type.toUpperCase()}</p>
                  <span className="text-[11px] text-foreground/35">
                    {new Date(entry.latestAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground/65">
                  {entry.latestSeverity.replaceAll("_", " ")}
                  {entry.latestScore != null ? ` • score ${entry.latestScore}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Triggers and Patterns">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Triggers</h3>
            <EntryList entries={report.triggers} emptyLabel="No corroborated trigger pattern yet." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Perpetuating Patterns</h3>
            <EntryList
              entries={report.perpetuatingPatterns}
              emptyLabel="No maintaining pattern reached threshold yet."
            />
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Protective Factors and Coping">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Protective Factors</h3>
            <EntryList
              entries={report.protectiveFactors}
              emptyLabel="Protective factors still need more evidence."
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Coping Strategies</h3>
            <EntryList
              entries={report.copingStrategies}
              emptyLabel="No coping strategy is sufficiently documented yet."
            />
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Functional Impact and Risk">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Functional Impact</h3>
            <EntryList entries={report.functionalImpact} emptyLabel="No functional impact section yet." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Risk History</h3>
            <p className="mb-2 text-sm text-foreground/65">
              Crisis-escalated sessions: {report.riskHistory.crisisSessions}
            </p>
            <EntryList entries={report.riskHistory.safetyFlags} emptyLabel="No safety flags in the current report." />
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Open Hypotheses">
        {report.openHypotheses.length === 0 ? (
          <p className="text-sm text-foreground/45">
            No clinician-facing hypothesis met the corroboration threshold yet.
          </p>
        ) : (
          <div className="space-y-3">
            {report.openHypotheses.map((entry) => (
              <div key={entry.hypothesis} className="rounded-lg bg-foreground/[0.03] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.hypothesis}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-foreground/35">
                      {entry.status === "supported" ? "supported" : "insufficient evidence"}
                    </p>
                  </div>
                  <span className="text-[11px] text-foreground/35">{(entry.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="mt-1 text-sm text-foreground/65">{entry.evidenceSummary}</p>
                <p className="mt-2 text-[11px] text-foreground/40">
                  Assessments: {entry.corroboratedBy.assessmentCount} • Narratives: {entry.corroboratedBy.narrativeCount} • Contradictions: {entry.corroboratedBy.contradictingCount}
                </p>
                <EvidenceRefsList refs={entry.evidenceRefs} />
              </div>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Questions For a Human Therapist">
        <EntryList
          entries={report.unansweredQuestions}
          emptyLabel="No open follow-up questions are currently flagged."
        />
      </ReportSection>

      <ReportSection title="Evidence Gaps and Contradictions">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-foreground/[0.03] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-foreground/35">
              Coverage
            </p>
            <p className="mt-2 text-sm text-foreground/65">
              Understanding items: {report.evidenceCoverage.understandingItems}
            </p>
            <p className="mt-1 text-sm text-foreground/65">
              Reflections integrated: {report.evidenceCoverage.reflectionsIntegrated}
            </p>
            <p className="mt-1 text-sm text-foreground/65">
              Unsupported hypotheses suppressed: {report.evidenceCoverage.unsupportedHypothesesSuppressed}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-foreground/45">
              {report.evidenceCoverage.hypothesisThreshold}
            </p>
            {report.evidenceCoverage.insufficientEvidenceSections.length > 0 && (
              <p className="mt-3 text-xs text-foreground/45">
                Thin sections: {report.evidenceCoverage.insufficientEvidenceSections.join(", ")}
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground/70">Contradictions</h3>
            {report.clinicalSignals.contradictions.length === 0 ? (
              <p className="text-sm text-foreground/45">No major contradiction was detected in the current report.</p>
            ) : (
              <div className="space-y-3">
                {report.clinicalSignals.contradictions.map((entry) => (
                  <div key={`${entry.label}-${entry.detail}`} className="rounded-lg bg-foreground/[0.03] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{entry.label}</p>
                      <span className="text-[11px] uppercase tracking-wide text-foreground/35">
                        {entry.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/65">{entry.detail}</p>
                    <EvidenceRefsList refs={entry.evidenceRefs} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ReportSection>
    </div>
  );
}
