import { Link } from "react-router";
import type { TimelineAssessment, TimelineSession } from "@/stores/journey-store.js";

interface SessionTimelineProps {
  sessions: TimelineSession[];
  assessments: TimelineAssessment[];
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const SEVERITY_LABELS: Record<string, string> = {
  minimal: "Minimal",
  mild: "Mild",
  moderate: "Moderate",
  moderately_severe: "Moderately Severe",
  severe: "Severe",
};

const SEVERITY_COLORS: Record<string, string> = {
  minimal: "bg-primary/10 text-primary",
  mild: "bg-yellow-100 text-yellow-800",
  moderate: "bg-orange-100 text-orange-800",
  moderately_severe: "bg-red-100 text-red-700",
  severe: "bg-red-200 text-red-800",
};

export function SessionTimeline({ sessions, assessments }: SessionTimelineProps) {
  return (
    <div className="space-y-4">
      {/* Assessment Progression */}
      {assessments.length >= 2 && (
        <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Assessment Progression</h3>
          <div className="flex flex-wrap items-center gap-2">
            {assessments
              .slice()
              .reverse()
              .map((a, i, arr) => (
                <div key={a.id} className="flex items-center gap-2">
                  <div className="text-center">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${SEVERITY_COLORS[a.severity] ?? "bg-foreground/5 text-foreground/60"}`}
                    >
                      {SEVERITY_LABELS[a.severity] ?? a.severity}
                    </span>
                    <p className="mt-1 text-[10px] text-foreground/40">
                      {a.type.toUpperCase()} — {formatDate(a.createdAt)}
                    </p>
                  </div>
                  {i < arr.length - 1 && <span className="text-foreground/20">&rarr;</span>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Sessions</h3>
          <div className="space-y-3">
            {sessions.map((s) => (
              <Link
                key={s.id}
                to={`/chat/${s.id}`}
                className="block rounded-xl border border-foreground/5 bg-muted/30 p-4 transition-colors hover:border-primary/20 hover:bg-muted/50"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <time className="text-xs font-medium text-foreground/50">
                    {formatDate(s.startedAt)}
                  </time>
                </div>
                {s.themes && s.themes.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {s.themes.map((theme) => (
                      <span
                        key={theme}
                        className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
                {s.summary && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-foreground/60">
                    {s.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
