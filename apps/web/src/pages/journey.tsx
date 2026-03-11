import { useEffect } from "react";
import { Link } from "react-router";
import { ActiveStateCards } from "@/components/journey/active-state-cards.js";
import { FormulationMap } from "@/components/journey/formulation-map.js";
import { MoodTrajectory } from "@/components/journey/mood-trajectory.js";
import { ReflectiveQuestions } from "@/components/journey/reflective-questions.js";
import { SessionTimeline } from "@/components/journey/session-timeline.js";
import { ThemeOfToday } from "@/components/journey/theme-of-today.js";
import { WellbeingMap } from "@/components/journey/wellbeing-map.js";
import { api } from "@/lib/api.js";
import type {
  JourneyFormulation,
  TimelineAssessment,
  TimelineMemory,
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

        setInsights(insightsData as JourneyFormulation);
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
  const memoryItems = timeline.filter(
    (item): item is { type: "memory"; data: TimelineMemory } => item.type === "memory",
  );

  const hasTimeline =
    sessionItems.length > 0 ||
    assessmentItems.length > 0 ||
    moodItems.length > 0 ||
    memoryItems.length > 0;

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

      {/* Section 1: Theme of Today */}
      {!isLoadingInsights && insights && <ThemeOfToday formulation={insights} />}

      {/* Section 2: What's Active Right Now */}
      {!isLoadingInsights && insights && <ActiveStateCards formulation={insights} />}

      {/* Section 3: Wellbeing Map (not shown for sparse data) */}
      {!isLoadingInsights && insights && confidence !== "sparse" && (
        <WellbeingMap formulation={insights} />
      )}

      {/* Section 4: How We Understand This (not shown for sparse data) */}
      {!isLoadingInsights && insights && confidence !== "sparse" && (
        <FormulationMap formulation={insights} />
      )}

      {/* Section 5: Questions Worth Exploring */}
      {!isLoadingInsights && insights && <ReflectiveQuestions formulation={insights} />}

      {/* Sparse data gentle message for hidden sections */}
      {!isLoadingInsights && insights && confidence === "sparse" && (
        <div className="rounded-2xl border border-primary/10 bg-primary/5 p-6 text-center">
          <p className="text-sm leading-relaxed text-foreground/50">
            Your journey is just beginning. After a few more sessions, we'll show you patterns,
            roots, and deeper insights here.
          </p>
        </div>
      )}

      {/* Timeline & Charts Section */}
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

            {/* Memory Clusters */}
            {memoryItems.length > 0 && <MemoryClusters memories={memoryItems.map((m) => m.data)} />}

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

// ── Memory Clusters ─────────────────────────────────────────────

const MEMORY_TYPE_LABELS: Record<string, string> = {
  life_event: "Life Event",
  profile_fact: "About You",
  recurring_trigger: "Trigger",
  unresolved_thread: "Open Thread",
  coping_strategy: "Coping",
  relationship: "Relationship",
  symptom_episode: "Episode",
  win: "Win",
  goal: "Goal",
};

const MEMORY_TYPE_COLORS: Record<string, string> = {
  win: "bg-[#7c9a82]/10 text-[#7c9a82]",
  goal: "bg-teal-50 text-teal-700",
  relationship: "bg-[#b8a9c9]/10 text-[#b8a9c9]",
  life_event: "bg-amber-50 text-amber-700",
  recurring_trigger: "bg-orange-50 text-orange-600",
  unresolved_thread: "bg-foreground/5 text-foreground/50",
  coping_strategy: "bg-blue-50 text-blue-600",
  symptom_episode: "bg-rose-50 text-rose-600",
  profile_fact: "bg-foreground/5 text-foreground/50",
};

interface MemoryClustersProps {
  memories: Array<{
    id: string;
    content: string;
    memoryType: string;
    confidence: number;
    createdAt: string;
  }>;
}

function MemoryClusters({ memories }: MemoryClustersProps) {
  // Don't show safety_critical memories to user
  const visible = memories.filter((m) => m.memoryType !== "safety_critical");
  if (visible.length === 0) return null;

  return (
    <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Things We Remember</h3>
      <div className="flex flex-wrap gap-2">
        {visible.slice(0, 15).map((m) => {
          const colors = MEMORY_TYPE_COLORS[m.memoryType] ?? "bg-foreground/5 text-foreground/50";
          return (
            <span
              key={m.id}
              className={`inline-flex items-center gap-1.5 rounded-full border border-foreground/5 px-3 py-1.5 text-xs ${colors}`}
            >
              <span className="font-medium">
                {MEMORY_TYPE_LABELS[m.memoryType] ?? m.memoryType}
              </span>
              <span className="opacity-70">
                {m.content.length > 50 ? `${m.content.slice(0, 50)}...` : m.content}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
