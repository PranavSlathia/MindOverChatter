import type { JourneyFormulation } from "@/stores/journey-store.js";

interface ThemeOfTodayProps {
  formulation: JourneyFormulation;
}

const PLACEHOLDER_PHRASES = [
  "We're still gathering threads",
  "we're still gathering threads",
];

export function ThemeOfToday({ formulation }: ThemeOfTodayProps) {
  const theme = formulation.themeOfToday;

  // Return null if empty or placeholder text
  if (!theme || PLACEHOLDER_PHRASES.some((p) => theme.includes(p))) {
    return null;
  }

  const { summary, encouragement } = formulation.userReflection;

  return (
    <div className="space-y-2">
      <p className="text-lg font-medium leading-relaxed text-foreground/80">{theme}</p>
      {summary && (
        <p className="text-sm leading-relaxed text-foreground/55">{summary}</p>
      )}
      {encouragement && (
        <p className="text-sm leading-relaxed text-primary/70">{encouragement}</p>
      )}
    </div>
  );
}
