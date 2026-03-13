import { useEffect } from "react";
import { Link } from "react-router";
import { FormulationMap } from "@/components/journey/formulation-map.js";
import { HowYoureDoing } from "@/components/journey/how-youre-doing.js";
import { MoodTrajectory } from "@/components/journey/mood-trajectory.js";
import { ReflectiveQuestions } from "@/components/journey/reflective-questions.js";
import { SessionTimeline } from "@/components/journey/session-timeline.js";
import { ThemeOfToday } from "@/components/journey/theme-of-today.js";
import { WhatMightHelp } from "@/components/journey/what-might-help.js";
import { WorkingToward } from "@/components/journey/working-toward.js";
import { api } from "@/lib/api.js";
import type {
  JourneyFormulation,
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
    therapyPlanGoals,
    hasTherapyPlan,
    isLoadingTherapyPlan,
    setTimeline,
    setInsights,
    setLoadingTimeline,
    setLoadingInsights,
    setError,
    setTherapyPlanGoals,
    setLoadingTherapyPlan,
  } = useJourneyStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: store actions are stable
  useEffect(() => {
    async function fetchData() {
      setLoadingTimeline(true);
      setLoadingInsights(true);
      setLoadingTherapyPlan(true);
      setError(null);

      try {
        const [timelineData, insightsData, therapyData] = await Promise.all([
          api.getJourneyTimeline(50),
          api.getJourneyInsights(),
          api.getTherapyPlanGoals(),
        ]);

        setTimeline(timelineData.items);
        setLoadingTimeline(false);

        setInsights(insightsData as JourneyFormulation);
        setLoadingInsights(false);

        setTherapyPlanGoals(therapyData.goals, therapyData.hasTherapyPlan);
        setLoadingTherapyPlan(false);
      } catch {
        setError("Failed to load journey data. Please try again.");
        setLoadingTimeline(false);
        setLoadingInsights(false);
        setLoadingTherapyPlan(false);
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

  const hasTimeline =
    sessionItems.length > 0 || assessmentItems.length > 0 || moodItems.length > 0;

  const confidence = insights?.dataConfidence ?? "sparse";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {/* Mood tracker link */}
      <div className="flex justify-end">
        <Link
          to="/mood"
          className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
          aria-label="Mood tracker"
        >
          Mood Tracker
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoadingInsights && (
        <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
            <span className="text-xs text-foreground/40">Generating insights...</span>
          </div>
        </div>
      )}

      {/* Section 1: Theme Banner */}
      {!isLoadingInsights && insights && <ThemeOfToday formulation={insights} />}

      {/* Section 2: How You're Doing (merged ActiveStates + WellbeingMap) */}
      {!isLoadingInsights && insights && <HowYoureDoing formulation={insights} />}

      {/* Section 3: Patterns We're Noticing (gated: confidence != sparse) */}
      {!isLoadingInsights && insights && confidence !== "sparse" && (
        <FormulationMap formulation={insights} />
      )}

      {/* Section 3.5: What We're Working Toward */}
      {!isLoadingInsights && !isLoadingTherapyPlan && hasTherapyPlan && therapyPlanGoals.length > 0 && (
        <WorkingToward goals={therapyPlanGoals} />
      )}

      {/* Section 4: Questions Worth Exploring */}
      {!isLoadingInsights && insights && <ReflectiveQuestions formulation={insights} />}

      {/* Section 5: What Might Help (merged ProtectiveStrengths + CopingSteps + ActionCards) */}
      {!isLoadingInsights && insights && <WhatMightHelp formulation={insights} />}

      {/* Sparse data gentle message */}
      {!isLoadingInsights && insights && confidence === "sparse" && (
        <div className="rounded-2xl border border-primary/10 bg-primary/5 p-6 text-center">
          <p className="text-sm leading-relaxed text-foreground/50">
            Your journey is just beginning. After a few more sessions, we'll show you patterns,
            roots, and deeper insights here.
          </p>
        </div>
      )}

      {/* Section 6: Your Journey So Far */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Your Journey So Far</h2>

        {isLoadingTimeline ? (
          <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
              <span className="text-xs text-foreground/40">Loading timeline...</span>
            </div>
          </div>
        ) : hasTimeline ? (
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
          </div>
        ) : (
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
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            </div>
            <p className="mb-2 text-sm font-medium text-foreground/70">
              Your journey is just beginning
            </p>
            <p className="mx-auto mb-5 max-w-xs text-xs leading-relaxed text-foreground/50">
              After a few sessions, we'll show you patterns, growth, and insights here. Every
              conversation helps us understand you better.
            </p>
            <Link
              to="/chat"
              className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Start a Session
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
