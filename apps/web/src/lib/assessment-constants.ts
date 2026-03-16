export const SEVERITY_LABELS: Record<string, string> = {
  minimal: "Minimal",
  mild: "Mild",
  moderate: "Moderate",
  moderately_severe: "Moderately Severe",
  severe: "Severe",
};

export const SEVERITY_COLORS: Record<string, string> = {
  minimal: "text-emerald-600",
  mild: "text-yellow-600",
  moderate: "text-orange-600",
  moderately_severe: "text-red-500",
  severe: "text-red-700",
};

/** Badge-style colors (bg + text) for timeline/pill usage */
export const SEVERITY_BADGE_COLORS: Record<string, string> = {
  minimal: "bg-primary/10 text-primary",
  mild: "bg-yellow-100 text-yellow-800",
  moderate: "bg-orange-100 text-orange-800",
  moderately_severe: "bg-red-100 text-red-700",
  severe: "bg-red-200 text-red-800",
};

export const SEVERITY_DESCRIPTIONS: Record<string, string> = {
  minimal: "Your responses suggest you're doing well in this area.",
  mild: "Your responses suggest some mild concerns. It may be worth keeping an eye on how you feel.",
  moderate:
    "Your responses suggest moderate concerns. Consider exploring this further in a chat session.",
  moderately_severe:
    "Your responses indicate notable concerns. We'd encourage talking through this with your wellness companion.",
  severe:
    "Your responses suggest significant concerns. Please consider reaching out to a professional for support.",
};
