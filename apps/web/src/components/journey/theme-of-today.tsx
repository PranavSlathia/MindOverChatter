import type { JourneyFormulation } from "@/stores/journey-store.js";

interface ThemeOfTodayProps {
  formulation: JourneyFormulation;
}

export function ThemeOfToday({ formulation }: ThemeOfTodayProps) {
  const theme =
    formulation.themeOfToday ||
    (formulation.moodTrend.direction === "improving"
      ? `Your mood has been improving over the ${formulation.moodTrend.period}`
      : formulation.moodTrend.direction === "declining"
        ? `Your mood has been shifting over the ${formulation.moodTrend.period}`
        : `Your mood has been steady over the ${formulation.moodTrend.period}`);

  const { summary, encouragement } = formulation.userReflection;

  return (
    <div className="space-y-3">
      {/* Theme of Today */}
      <div className="rounded-2xl border border-primary/15 bg-primary/5 px-6 py-5">
        <p className="text-base leading-relaxed text-foreground/80">{theme}</p>
      </div>

      {/* User-facing reflection (separate from internal formulation) */}
      {summary && (
        <div className="rounded-2xl border border-foreground/10 bg-white px-6 py-5 shadow-sm">
          <p className="text-sm leading-relaxed text-foreground/70">{summary}</p>
          {encouragement && (
            <p className="mt-2 text-sm leading-relaxed text-primary/80">{encouragement}</p>
          )}
        </div>
      )}
    </div>
  );
}
