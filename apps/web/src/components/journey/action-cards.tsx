import type { DomainKey, JourneyFormulation } from "@/stores/journey-store.js";

interface ActionCardsProps {
  formulation: JourneyFormulation;
}

const DOMAIN_LABELS: Record<DomainKey, string> = {
  connection: "Connection",
  momentum: "Momentum",
  groundedness: "Groundedness",
  meaning: "Meaning",
  self_regard: "Self-Regard",
  vitality: "Vitality",
};

const DOMAIN_TAG_COLORS: Record<DomainKey, string> = {
  connection: "bg-[#7c9a82]/15 text-[#7c9a82]",
  momentum: "bg-amber-500/15 text-amber-600",
  groundedness: "bg-[#b8a9c9]/15 text-[#b8a9c9]",
  meaning: "bg-teal-500/15 text-teal-600",
  self_regard: "bg-rose-400/15 text-rose-500",
  vitality: "bg-orange-500/15 text-orange-600",
};

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-primary/30",
  medium: "border-foreground/10",
  low: "border-foreground/5",
};

export function ActionCards({ formulation }: ActionCardsProps) {
  const actions = formulation.actionRecommendations;
  if (!actions || actions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Worth Exploring Next</h2>
      <p className="mb-5 text-xs text-foreground/40">
        Conversation directions that might help right now
      </p>

      <div className="grid gap-3">
        {actions.map((action) => (
          <div
            key={action.id}
            className={`rounded-xl border ${PRIORITY_BORDER[action.priority]} bg-muted/30 p-4`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${DOMAIN_TAG_COLORS[action.domain]}`}
              >
                {DOMAIN_LABELS[action.domain]}
              </span>
              {action.priority === "high" && (
                <span className="text-[10px] font-medium text-primary/60">Suggested</span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-foreground/70">
              {action.conversationHint}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/40">
              {action.evidenceSummary}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
