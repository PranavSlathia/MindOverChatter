import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type {
  ObservabilityAlert,
  ObservabilityStats,
  ObservabilityTurn,
  SessionSummary,
} from "@/lib/api.js";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";

// ── Helpers ──────────────────────────────────────────────────────────

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

// ── Stat Card ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "yellow" | "red" | "default";
}) {
  const accentColor =
    accent === "green"
      ? "text-primary"
      : accent === "yellow"
        ? "text-amber-600"
        : accent === "red"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className="rounded-xl border border-foreground/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-foreground/50">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", accentColor)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-foreground/40">{sub}</p>}
    </div>
  );
}

// ── Confidence Badge ─────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-foreground/30">--</span>;
  const color =
    value >= 0.7
      ? "bg-primary/15 text-primary"
      : value >= 0.5
        ? "bg-amber-100 text-amber-700"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", color)}>
      {(value * 100).toFixed(0)}%
    </span>
  );
}

// ── Score Badge ──────────────────────────────────────────────────────

function ScoreBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-foreground/30">--</span>;
  const color =
    value >= 0.8
      ? "bg-primary/15 text-primary"
      : value >= 0.5
        ? "bg-amber-100 text-amber-700"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", color)}>
      {value.toFixed(2)}
    </span>
  );
}

// ── Depth Badge ──────────────────────────────────────────────────────

function DepthBadge({ depth }: { depth: string | null | undefined }) {
  if (!depth) return <span className="text-xs text-foreground/30">--</span>;
  const color =
    depth === "deep"
      ? "bg-primary/15 text-primary"
      : depth === "medium"
        ? "bg-accent/20 text-accent"
        : "bg-foreground/10 text-foreground/50";
  return (
    <span
      className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", color)}
    >
      {depth}
    </span>
  );
}

// ── Turn Status Indicator ────────────────────────────────────────────

function turnStatus(turn: ObservabilityTurn): "green" | "yellow" | "red" {
  if (turn.validator.safe === false || turn.crisis.detected) return "red";
  if (
    turn.supervisor.depthAlertFired ||
    (turn.supervisor.confidence != null && turn.supervisor.confidence < 0.5)
  ) {
    return "yellow";
  }
  return "green";
}

const statusDot: Record<string, string> = {
  green: "bg-primary",
  yellow: "bg-amber-500",
  red: "bg-destructive",
};

// ── Turn Card (Expandable) ───────────────────────────────────────────

function TurnCard({ turn }: { turn: ObservabilityTurn }) {
  const [expanded, setExpanded] = useState(false);
  const status = turnStatus(turn);

  return (
    <div
      className={cn(
        "rounded-xl border bg-white shadow-sm",
        status === "red"
          ? "border-destructive/30"
          : status === "yellow"
            ? "border-amber-300/50"
            : "border-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", statusDot[status])}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground">Turn {turn.turnNumber}</span>
          <span className="ml-2 text-xs text-foreground/40">{formatDate(turn.createdAt)}</span>
        </span>
        <span className="flex items-center gap-2">
          {turn.crisis.detected && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
              Crisis
            </span>
          )}
          {turn.supervisor.depthAlertFired && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Depth Alert
            </span>
          )}
          <ConfidenceBadge value={turn.supervisor.confidence} />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("text-foreground/30 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-foreground/5 px-4 py-3">
          {/* Crisis */}
          <DetailRow label="Crisis">
            {turn.crisis.detected ? (
              <span className="text-xs text-destructive">
                Detected (severity: {turn.crisis.severity ?? "unknown"})
                {turn.crisis.matchedPhrases && turn.crisis.matchedPhrases.length > 0 && (
                  <span className="ml-1 text-foreground/40">
                    -- matched: {(turn.crisis.matchedPhrases as string[]).join(", ")}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-primary">Clear</span>
            )}
          </DetailRow>

          {/* Mode */}
          <DetailRow label="Mode">
            <span className="text-xs text-foreground/70">
              {turn.mode.before ?? "--"}{" "}
              {turn.mode.before !== turn.mode.after ? ` \u2192 ${turn.mode.after ?? "--"}` : ""}
              {turn.mode.shiftSource && turn.mode.shiftSource !== "none" && (
                <span className="ml-1 text-foreground/40">(via {turn.mode.shiftSource})</span>
              )}
            </span>
          </DetailRow>

          {/* Supervisor */}
          <DetailRow label="Supervisor">
            {turn.supervisor.ran ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-foreground/50">Confidence:</span>
                  <ConfidenceBadge value={turn.supervisor.confidence} />
                  <span className="text-foreground/50">Depth:</span>
                  <DepthBadge depth={turn.supervisor.depth} />
                </div>
                {turn.supervisor.focus && (
                  <p className="text-xs text-foreground/60">Focus: {turn.supervisor.focus}</p>
                )}
                {turn.supervisor.skills && turn.supervisor.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(turn.supervisor.skills as string[]).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs text-foreground/30">Did not run</span>
            )}
          </DetailRow>

          {/* Validator */}
          <DetailRow label="Validator">
            {turn.validator.ran ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-foreground/50">Score:</span>
                  <ScoreBadge value={turn.validator.score} />
                  <span className="text-foreground/50">Safe:</span>
                  {turn.validator.safe === false ? (
                    <span className="font-medium text-destructive">UNSAFE</span>
                  ) : (
                    <span className="text-primary">Yes</span>
                  )}
                </div>
                {turn.validator.issues &&
                  Array.isArray(turn.validator.issues) &&
                  (turn.validator.issues as Array<{ type?: string; detail?: string }>).length >
                    0 && (
                    <ul className="list-inside list-disc text-xs text-destructive/80">
                      {(turn.validator.issues as Array<{ type?: string; detail?: string }>).map(
                        (issue) => (
                          <li key={`${issue.type}-${issue.detail}`}>
                            {issue.type ?? "issue"}: {issue.detail ?? ""}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
              </div>
            ) : (
              <span className="text-xs text-foreground/30">Did not run</span>
            )}
          </DetailRow>

          {/* Multi-Model Reviewers */}
          {turn.reviewerResults &&
            Array.isArray(turn.reviewerResults) &&
            (turn.reviewerResults as Array<{ reviewer?: string; score?: number; failed?: boolean; issues?: Array<{ type?: string }>; latencyMs?: number }>).length > 0 && (
            <DetailRow label="Reviewers">
              <div className="space-y-2">
                {(turn.reviewerResults as Array<{ reviewer?: string; score?: number; failed?: boolean; issues?: Array<{ type?: string; severity?: string }>; latencyMs?: number }>).map(
                  (r) => (
                    <div
                      key={r.reviewer}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="font-medium text-foreground/70 capitalize">
                        {r.reviewer?.replace("_", " ") ?? "Unknown"}
                      </span>
                      {r.failed ? (
                        <span className="text-foreground/30">failed</span>
                      ) : (
                        <>
                          <ScoreBadge value={r.score ?? null} />
                          {r.issues && r.issues.length > 0 && (
                            <span className="text-destructive/70">
                              {r.issues.length} issue{r.issues.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </>
                      )}
                      <span className="text-foreground/30">
                        {formatMs(r.latencyMs ?? null)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </DetailRow>
          )}

          {/* Timing */}
          <DetailRow label="Timing">
            <div className="flex flex-wrap gap-3 text-xs text-foreground/60">
              <span>Pipeline: {formatMs(turn.timing.totalPipelineMs)}</span>
              <span>Claude: {formatMs(turn.timing.claudeResponseMs)}</span>
              <span>Supervisor: {formatMs(turn.supervisor.latencyMs)}</span>
              <span>Validator: {formatMs(turn.validator.latencyMs)}</span>
            </div>
          </DetailRow>

          {/* Context */}
          {(turn.context.activeSkills ||
            turn.context.memoriesInjectedCount ||
            turn.context.textEmotionLabel) && (
            <DetailRow label="Context">
              <div className="space-y-1 text-xs text-foreground/60">
                {turn.context.memoriesInjectedCount != null && (
                  <p>Memories injected: {turn.context.memoriesInjectedCount}</p>
                )}
                {turn.context.textEmotionLabel && (
                  <p>
                    Text emotion: {turn.context.textEmotionLabel}
                    {turn.context.textEmotionConfidence != null &&
                      ` (${(turn.context.textEmotionConfidence * 100).toFixed(0)}%)`}
                  </p>
                )}
                {turn.context.activeSkills &&
                  (turn.context.activeSkills as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(turn.context.activeSkills as string[]).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground/50"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail Row ───────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-foreground/50">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── Alert Item ───────────────────────────────────────────────────────

function AlertItem({ alert }: { alert: ObservabilityAlert }) {
  const isUnsafe = alert.validator.safe === false;
  const isDepth = alert.supervisor.depthAlertFired;

  const colorClass = isUnsafe
    ? "border-destructive/30 bg-destructive/5"
    : isDepth
      ? "border-amber-300/50 bg-amber-50"
      : "border-foreground/10 bg-foreground/5";
  const badgeText = isUnsafe ? "Unsafe Response" : isDepth ? "Depth Alert" : "Alert";
  const badgeClass = isUnsafe
    ? "bg-destructive/15 text-destructive"
    : isDepth
      ? "bg-amber-100 text-amber-700"
      : "bg-foreground/10 text-foreground/50";

  return (
    <div className={cn("rounded-xl border p-3 shadow-sm", colorClass)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badgeClass)}>
            {badgeText}
          </span>
          <span className="text-xs text-foreground/50">Turn {alert.turnNumber}</span>
        </div>
        <span className="text-xs text-foreground/40">{formatDate(alert.createdAt)}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-foreground/60">
        <Link
          to={`/chat/${alert.sessionId}`}
          className="text-primary underline decoration-primary/30 hover:decoration-primary"
        >
          View session
        </Link>
        {isUnsafe && alert.validator.issues && Array.isArray(alert.validator.issues) && (
          <span>
            Issues:{" "}
            {(alert.validator.issues as Array<{ type?: string }>).map((i) => i.type).join(", ")}
          </span>
        )}
        {isDepth && alert.supervisor.depth && <span>Stuck at: {alert.supervisor.depth}</span>}
      </div>
    </div>
  );
}

// ── Depth Distribution Bar ───────────────────────────────────────────

function DepthBar({ surface, medium, deep }: { surface: number; medium: number; deep: number }) {
  const total = surface + medium + deep;
  if (total === 0) {
    return <span className="text-xs text-foreground/30">No depth data</span>;
  }

  const surfacePct = (surface / total) * 100;
  const mediumPct = (medium / total) * 100;
  const deepPct = (deep / total) * 100;

  return (
    <div className="space-y-1.5">
      <div
        className="flex h-3 overflow-hidden rounded-full"
        role="img"
        aria-label={`Depth: ${pct(surface, total)} surface, ${pct(medium, total)} medium, ${pct(deep, total)} deep`}
      >
        {surfacePct > 0 && <div className="bg-foreground/20" style={{ width: `${surfacePct}%` }} />}
        {mediumPct > 0 && <div className="bg-accent/60" style={{ width: `${mediumPct}%` }} />}
        {deepPct > 0 && <div className="bg-primary/70" style={{ width: `${deepPct}%` }} />}
      </div>
      <div className="flex justify-between text-xs text-foreground/50">
        <span>Surface {pct(surface, total)}</span>
        <span>Medium {pct(medium, total)}</span>
        <span>Deep {pct(deep, total)}</span>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export function ObservabilityPage() {
  const [stats, setStats] = useState<ObservabilityStats | null>(null);
  const [turns, setTurns] = useState<ObservabilityTurn[]>([]);
  const [alerts, setAlerts] = useState<ObservabilityAlert[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingTurns, setIsLoadingTurns] = useState(false);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch stats + alerts + sessions on mount
  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const [statsData, alertsData, sessionsData] = await Promise.all([
          api.getObservabilityStats(),
          api.getObservabilityAlerts({ limit: 30 }),
          api.getSessions(50),
        ]);
        setStats(statsData);
        setAlerts(alertsData.alerts);
        setSessions(sessionsData.sessions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load observability data");
      } finally {
        setIsLoadingStats(false);
        setIsLoadingAlerts(false);
      }
    }
    load();
  }, []);

  // Fetch turns when session changes
  const fetchTurns = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setTurns([]);
      return;
    }
    setIsLoadingTurns(true);
    try {
      const data = await api.getObservabilityTurns({ sessionId, limit: 100 });
      // Sort ascending by turn number for timeline display
      setTurns([...data.turns].sort((a, b) => a.turnNumber - b.turnNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load turns");
    } finally {
      setIsLoadingTurns(false);
    }
  }, []);

  function handleSessionChange(sessionId: string) {
    setSelectedSessionId(sessionId);
    fetchTurns(sessionId);
  }

  // Computed stats
  const supervisorSuccessRate =
    stats && stats.supervisor.runs > 0
      ? pct(
          turns.length > 0
            ? turns.filter((t) => t.supervisor.ran && (t.supervisor.confidence ?? 0) >= 0.6).length
            : stats.supervisor.runs,
          turns.length > 0 ? turns.filter((t) => t.supervisor.ran).length : stats.supervisor.runs,
        )
      : "--";

  const activeAlerts = stats ? stats.depth.alerts + stats.validator.unsafeTurns : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {/* Page header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-foreground/40">
          Dev / Admin
        </p>
        <h2 className="text-lg font-semibold text-foreground">Pipeline Observability</h2>
        <p className="text-xs text-foreground/50">
          Supervisor, validator, and safety metrics for every conversation turn.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* ── Section 1: Pipeline Health Summary ──────────────────────── */}
      <section aria-labelledby="health-heading">
        <h3 id="health-heading" className="mb-3 text-sm font-semibold text-foreground/70">
          Pipeline Health
        </h3>

        {isLoadingStats ? (
          <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
              <span className="text-xs text-foreground/40">Loading stats...</span>
            </div>
          </div>
        ) : stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total Turns" value={stats.totalTurns} />
              <StatCard
                label="Supervisor Success"
                value={supervisorSuccessRate}
                sub={`${stats.supervisor.runs} runs`}
                accent="green"
              />
              <StatCard
                label="Avg Validator Score"
                value={stats.validator.avgScore?.toFixed(2) ?? "--"}
                sub={`${stats.validator.runs} scored`}
                accent={
                  stats.validator.avgScore != null
                    ? stats.validator.avgScore >= 0.8
                      ? "green"
                      : stats.validator.avgScore >= 0.5
                        ? "yellow"
                        : "red"
                    : "default"
                }
              />
              <StatCard
                label="Active Alerts"
                value={activeAlerts}
                sub={`${stats.depth.alerts} depth, ${stats.validator.unsafeTurns} unsafe`}
                accent={activeAlerts > 0 ? "red" : "green"}
              />
            </div>

            {/* Depth Distribution */}
            <div className="rounded-xl border border-foreground/10 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium text-foreground/50">Depth Distribution</p>
              <DepthBar
                surface={stats.depth.surface}
                medium={stats.depth.medium}
                deep={stats.depth.deep}
              />
            </div>

            {/* Timing + Mode Shifts */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Avg Pipeline" value={formatMs(stats.timing.avgPipelineMs)} />
              <StatCard label="Avg Claude" value={formatMs(stats.timing.avgClaudeMs)} />
              <StatCard label="Mode Shifts" value={stats.modeShifts} />
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Section 2: Session Pipeline Viewer ──────────────────────── */}
      <section aria-labelledby="pipeline-heading">
        <h3 id="pipeline-heading" className="mb-3 text-sm font-semibold text-foreground/70">
          Session Pipeline Viewer
        </h3>

        <div className="rounded-xl border border-foreground/10 bg-white p-4 shadow-sm">
          <label
            htmlFor="session-select"
            className="mb-1 block text-xs font-medium text-foreground/50"
          >
            Select a session
          </label>
          <select
            id="session-select"
            value={selectedSessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
            className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">-- Choose a session --</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.startedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ({s.status})
              </option>
            ))}
          </select>
        </div>

        {/* Turn timeline */}
        <div className="mt-3 space-y-2">
          {isLoadingTurns ? (
            <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
                <span className="text-xs text-foreground/40">Loading turn events...</span>
              </div>
            </div>
          ) : selectedSessionId && turns.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-foreground/40">
                No turn events recorded for this session.
              </p>
            </div>
          ) : !selectedSessionId ? (
            <div className="rounded-xl border border-primary/10 bg-primary/5 p-6 text-center">
              <p className="text-sm text-foreground/50">
                Select a session above to view its pipeline data.
              </p>
            </div>
          ) : (
            turns.map((turn) => <TurnCard key={turn.id} turn={turn} />)
          )}
        </div>
      </section>

      {/* ── Section 3: Alert Feed ────────────────────────────────────── */}
      <section aria-labelledby="alerts-heading">
        <h3 id="alerts-heading" className="mb-3 text-sm font-semibold text-foreground/70">
          Alert Feed
        </h3>

        {isLoadingAlerts ? (
          <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
              <span className="text-xs text-foreground/40">Loading alerts...</span>
            </div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-xl border border-primary/10 bg-primary/5 p-6 text-center">
            <p className="text-sm text-foreground/50">
              No alerts. All pipeline checks are passing.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </section>

      {/* Empty state when no data at all */}
      {!isLoadingStats && stats && stats.totalTurns === 0 && (
        <div className="rounded-2xl border border-primary/10 bg-primary/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <p className="mb-2 text-sm font-medium text-foreground/70">No turn events recorded yet</p>
          <p className="mx-auto mb-5 max-w-xs text-xs leading-relaxed text-foreground/50">
            Start a conversation to see pipeline data. Every turn will show supervisor confidence,
            validator scores, depth tracking, and timing breakdowns.
          </p>
          <Link
            to="/chat"
            className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Start a Session
          </Link>
        </div>
      )}
    </div>
  );
}
