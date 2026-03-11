import type { DomainKey, JourneyFormulation } from "@/stores/journey-store.js";

interface CopingStepsProps {
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

export function CopingSteps({ formulation }: CopingStepsProps) {
  const steps = formulation.copingSteps;
  if (!steps || steps.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Things That Might Help</h2>
      <p className="mb-5 text-xs text-foreground/40">
        Small steps worth trying, based on what you've been sharing
      </p>

      <div className="space-y-4">
        {steps.map((s, i) => {
          const tagColors =
            DOMAIN_TAG_COLORS[s.domain] ?? "bg-foreground/5 text-foreground/50";

          return (
            <div
              key={`step-${i}`}
              className="rounded-xl border border-foreground/8 bg-primary/3 px-4 py-3.5"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tagColors}`}>
                  {DOMAIN_LABELS[s.domain] ?? s.domain}
                </span>
              </div>
              <p className="mb-1 text-sm font-medium leading-snug text-foreground/85">{s.step}</p>
              <p className="text-xs leading-relaxed text-foreground/55">{s.rationale}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
