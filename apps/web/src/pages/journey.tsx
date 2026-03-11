import { useEffect } from "react";
import { Link } from "react-router";
import { InnerLandscape, NextSteps } from "@/components/journey/insights-section.js";
import { MoodTrajectory } from "@/components/journey/mood-trajectory.js";
import { SessionTimeline } from "@/components/journey/session-timeline.js";
import { api } from "@/lib/api.js";
import type {
  JourneyInsights,
  TimelineAssessment,
  TimelineMood,
  TimelineSession,
} from "@/stores/journey-store.js";
import { useJourneyStore } from "@/stores/journey-store.js";

export function JourneyPage() {
  const {
    timeline,
    insights,
    isLoadingTimeline,
    isLoadingInsights,
    error,
    setTimeline,
    setInsights,
    setLoadingTimeline,
    setLoadingInsights,
    setError,
  } = useJourneyStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: store actions are stable
  useEffect(() => {
    async function fetchData() {
      setLoadingTimeline(true);
      setLoadingInsights(true);
      setError(null);

      try {
        const [timelineData, insightsData] = await Promise.all([
          api.getJourneyTimeline(50),
          api.getJourneyInsights(),
        ]);

        setTimeline(timelineData.items);
        setLoadingTimeline(false);

        setInsights(insightsData as JourneyInsights);
        setLoadingInsights(false);
      } catch {
        setError("Failed to load journey data. Please try again.");
        setLoadingTimeline(false);
        setLoadingInsights(false);
      }
    }

    fetchData();
  }, []);

  // Extract typed items from timeline
  const sessionItems = timeline.filter(
    (item): item is { type: "session"; data: TimelineSession } => item.type === "session",
  );
  const assessmentItems = timeline.filter(
    (item): item is { type: "assessment"; data: TimelineAssessment } => item.type === "assessment",
  );
  const moodItems = timeline.filter(
    (item): item is { type: "mood"; data: TimelineMood } => item.type === "mood",
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-foreground/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Your Journey</h1>
            <p className="text-xs text-foreground/40">Reflections, patterns, and progress</p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Home
            </Link>
            <Link
              to="/chat"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              New Session
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Section 1: Inner Landscape */}
        {isLoadingInsights ? (
          <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
              <span className="text-xs text-foreground/40">Generating insights...</span>
            </div>
          </div>
        ) : insights ? (
          <InnerLandscape insights={insights} />
        ) : null}

        {/* Section 2: Journey So Far */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Your Journey So Far</h2>

          {isLoadingTimeline ? (
            <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
                <span className="text-xs text-foreground/40">Loading timeline...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <MoodTrajectory
                moods={moodItems.map((m) => m.data)}
                direction={insights?.moodTrend.direction ?? "stable"}
                period={insights?.moodTrend.period ?? ""}
              />

              <SessionTimeline
                sessions={sessionItems.map((s) => s.data)}
                assessments={assessmentItems.map((a) => a.data)}
              />

              {sessionItems.length === 0 &&
                assessmentItems.length === 0 &&
                moodItems.length === 0 && (
                  <div className="rounded-2xl border border-foreground/10 bg-white p-8 text-center shadow-sm">
                    <p className="mb-2 text-sm text-foreground/60">Your journey starts here</p>
                    <p className="mb-4 text-xs text-foreground/40">
                      After your first session, you'll see a timeline of your conversations, moods,
                      and progress.
                    </p>
                    <Link
                      to="/chat"
                      className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Start Your First Session
                    </Link>
                  </div>
                )}
            </div>
          )}
        </section>

        {/* Section 3: Next Steps */}
        {!isLoadingInsights && insights && <NextSteps insights={insights} />}
      </main>
    </div>
  );
}
