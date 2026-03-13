import type { DomainKey, JourneyFormulation } from "@/stores/journey-store.js";

interface WhatMightHelpProps {
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

const SOURCE_ICON: Record<string, string> = {
  win: "\u2726",
  goal: "\u25CE",
  relationship: "\u2661",
};

const SOURCE_COLORS: Record<string, string> = {
  win: "bg-[#7c9a82]/10 border-[#7c9a82]/20 text-[#7c9a82]",
  goal: "bg-teal-50 border-teal-200 text-teal-700",
  relationship: "bg-[#b8a9c9]/10 border-[#b8a9c9]/20 text-[#b8a9c9]",
  coping_strategy: "bg-amber-50 border-amber-200 text-amber-700",
};

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-primary/30",
  medium: "border-foreground/10",
  low: "border-foreground/5",
};

export function WhatMightHelp({ formulation }: WhatMightHelpProps) {
  const strengths = formulation.formulation.protectiveStrengths;
  const copingSteps = formulation.copingSteps;
  const actions = formulation.actionRecommendations;

  const hasStrengths = strengths && strengths.length > 0;
  const hasCopingSteps = copingSteps && copingSteps.length > 0;
  const hasActions = actions && actions.length > 0;

  if (!hasStrengths && !hasCopingSteps && !hasActions) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">What Might Help</h2>
      <p className="mb-5 text-xs text-foreground/40">
        Strengths, steps, and directions worth exploring
      </p>

      <div className="space-y-6">
        {/* What's already working — from protectiveStrengths */}
        {hasStrengths && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-[#7c9a82] uppercase">
              What's already working
            </h3>
            <div className="flex flex-wrap gap-2">
              {strengths.map((strength, i) => {
                const icon = SOURCE_ICON[strength.sourceType] ?? "\u2022";
                const colors =
                  SOURCE_COLORS[strength.sourceType] ??
                  "bg-foreground/5 border-foreground/10 text-foreground/60";

                return (
                  <div
                    key={`strength-${i}`}
                    className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm leading-snug ${colors}`}
                  >
                    <span className="mt-0.5 shrink-0 text-xs" aria-hidden="true">
                      {icon}
                    </span>
                    <span>{strength.content}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Steps to try — from copingSteps */}
        {hasCopingSteps && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-foreground/50 uppercase">
              Steps to try
            </h3>
            <div className="space-y-2">
              {copingSteps.map((s, i) => {
                const tagColors =
                  DOMAIN_TAG_COLORS[s.domain] ?? "bg-foreground/5 text-foreground/50";

                return (
                  <div
                    key={`step-${i}`}
                    className="rounded-lg border border-foreground/8 bg-primary/3 px-3.5 py-3"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tagColors}`}
                      >
                        {DOMAIN_LABELS[s.domain] ?? s.domain}
                      </span>
                    </div>
                    <p className="mb-1 text-sm font-medium leading-snug text-foreground/85">
                      {s.step}
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/55">{s.rationale}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommended actions — from actionRecommendations */}
        {hasActions && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-foreground/50 uppercase">
              Recommended actions
            </h3>
            <div className="space-y-2">
              {actions.map((action) => (
                <div
                  key={action.id}
                  className={`rounded-lg border ${PRIORITY_BORDER[action.priority]} bg-muted/30 p-3.5`}
                >
                  <div className="mb-1.5 flex items-center gap-2">
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
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">
                    {action.evidenceSummary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
