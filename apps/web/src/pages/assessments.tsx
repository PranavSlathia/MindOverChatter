import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api.js";
import {
  getAssessmentsByCategory,
  type AssessmentDefinition,
} from "@/data/assessment-questions.js";
import { cn } from "@/lib/utils.js";

type LibraryData = {
  latestByType: Record<string, { severity: string; createdAt: string }>;
};

const SEVERITY_COLORS: Record<string, string> = {
  minimal: "text-emerald-600",
  mild: "text-yellow-600",
  moderate: "text-orange-600",
  moderately_severe: "text-red-500",
  severe: "text-red-700",
};

const SEVERITY_LABELS: Record<string, string> = {
  minimal: "Minimal",
  mild: "Mild",
  moderate: "Moderate",
  moderately_severe: "Mod. Severe",
  severe: "Severe",
};

export function AssessmentsPage() {
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLibrary() {
      setIsLoading(true);
      try {
        const data = await api.getAssessmentLibrary();
        if (!cancelled) setLibrary(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchLibrary();
    return () => { cancelled = true; };
  }, []);

  const categories = getAssessmentsByCategory();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-foreground/50">Loading assessments...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      {categories.map(({ category, label, assessments }) => (
        <section key={category}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground/50">
            {label}
          </h2>
          <div className="grid gap-3">
            {assessments.map((def) => (
              <AssessmentCard
                key={def.type}
                definition={def}
                latest={library?.latestByType[def.type]}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssessmentCard({
  definition,
  latest,
}: {
  definition: AssessmentDefinition;
  latest?: { severity: string; createdAt: string };
}) {
  const lastTaken = latest
    ? new Date(latest.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Link
      to={`/assessments/${definition.type}`}
      className="group flex items-center justify-between rounded-xl border border-foreground/10 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary">
            {definition.name}
          </h3>
          <span className="text-[10px] text-foreground/40">
            {definition.questions.length} items &middot; ~{definition.estimatedMinutes}min
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-foreground/60">{definition.description}</p>
      </div>

      <div className="ml-3 flex shrink-0 flex-col items-end gap-0.5">
        {latest ? (
          <>
            <span className={cn("text-xs font-medium", SEVERITY_COLORS[latest.severity])}>
              {SEVERITY_LABELS[latest.severity] ?? latest.severity}
            </span>
            <span className="text-[10px] text-foreground/40">{lastTaken}</span>
          </>
        ) : (
          <span className="text-xs text-foreground/40">Not taken</span>
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 text-foreground/30 group-hover:text-primary"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}
