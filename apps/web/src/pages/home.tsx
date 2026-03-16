import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type HomeSummary } from "@/lib/api.js";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function JourneySignal({ summary }: { summary: HomeSummary }) {
  const { moodTrendDirection, sessionCount, memoryCount } = summary.journeySignal;

  const trendLabel =
    moodTrendDirection === "improving"
      ? "Your mood has been improving"
      : moodTrendDirection === "declining"
        ? "Your mood has been shifting lately"
        : "Your mood has been steady";

  return (
    <div className="rounded-xl border border-foreground/10 bg-white p-4 shadow-sm">
      <p className="text-sm text-foreground/70">{trendLabel}</p>
      <div className="mt-2 flex items-center gap-4 text-xs text-foreground/50">
        <span>
          {sessionCount} session{sessionCount === 1 ? "" : "s"}
        </span>
        <span className="text-foreground/20">|</span>
        <span>
          {memoryCount} memor{memoryCount === 1 ? "y" : "ies"} captured
        </span>
      </div>
    </div>
  );
}

function ResumeCard({ summary }: { summary: HomeSummary }) {
  if (!summary.lastSession) return null;

  const { lastSession, suggestedAction } = summary;
  const isActive = lastSession.status === "active";

  return (
    <div className="rounded-2xl border border-foreground/10 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/50">
          {isActive ? "Active session" : "Last session"}
        </p>
        <p className="text-xs text-foreground/40">{formatRelativeDate(lastSession.startedAt)}</p>
      </div>

      {lastSession.summaryExcerpt && (
        <p className="mb-3 text-sm leading-relaxed text-foreground/70">
          {lastSession.summaryExcerpt}
          {lastSession.summaryExcerpt.length >= 120 ? "..." : ""}
        </p>
      )}

      <p className="mb-4 text-xs text-foreground/50 italic">{suggestedAction}</p>

      <div className="flex items-center gap-3">
        {isActive ? (
          <Link
            to={`/chat/${lastSession.id}`}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Continue Session
          </Link>
        ) : (
          <>
            <Link
              to="/chat"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Start New Session
            </Link>
            <Link
              to={`/chat/${lastSession.id}`}
              className="rounded-lg border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Review Last
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2">
      <Link
        to="/chat"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-foreground/10 bg-primary/5 p-3 transition-colors hover:bg-primary/10"
        aria-label="Start a new chat session"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="text-[11px] font-medium text-foreground">Chat</span>
      </Link>

      <Link
        to="/mood"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-foreground/10 bg-accent/5 p-3 transition-colors hover:bg-accent/10"
        aria-label="Log your mood"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <span className="text-[11px] font-medium text-foreground">Mood</span>
      </Link>

      <Link
        to="/journey"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-foreground/10 bg-background p-3 transition-colors hover:bg-foreground/5"
        aria-label="View your journey"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground/60"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
        <span className="text-[11px] font-medium text-foreground">Journey</span>
      </Link>

      <Link
        to="/history"
        className="flex flex-col items-center gap-1.5 rounded-xl border border-foreground/10 bg-background p-3 transition-colors hover:bg-foreground/5"
        aria-label="View session history"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground/60"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-[11px] font-medium text-foreground">History</span>
      </Link>
    </div>
  );
}

export function HomePage() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .getHomeSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      {/* Welcome header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">{getGreeting()}</h2>
        <p className="mt-1 text-sm text-foreground/60">How are you feeling today?</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
          <span className="text-xs text-foreground/40">Loading...</span>
        </div>
      ) : summary ? (
        <>
          {/* Resume card */}
          <ResumeCard summary={summary} />

          {/* Journey signal */}
          <JourneySignal summary={summary} />

          {/* Quick actions — smaller, secondary */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground/40">Quick actions</p>
            <QuickActions />
          </div>
        </>
      ) : (
        <>
          {/* Fallback: first-time user or endpoint unavailable */}
          <div className="rounded-2xl border border-primary/10 bg-primary/5 p-6 text-center">
            <p className="mb-2 text-sm font-medium text-foreground/70">
              Welcome to MindOverChatter
            </p>
            <p className="mx-auto mb-4 max-w-xs text-xs leading-relaxed text-foreground/50">
              Your AI wellness companion. Start a session to begin your journey.
            </p>
            <Link
              to="/chat"
              className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Start Your First Session
            </Link>
          </div>

          {fetchError && (
            <p className="text-center text-xs text-foreground/40">
              Could not load your latest data. Showing default view.
            </p>
          )}

          <QuickActions />
        </>
      )}
    </div>
  );
}
