import type { DomainKey, JourneyFormulation } from "@/stores/journey-store.js";

interface WellbeingMapProps {
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

const DOMAIN_BG: Record<DomainKey, string> = {
  connection: "bg-[#7c9a82]",
  momentum: "bg-amber-500",
  groundedness: "bg-[#b8a9c9]",
  meaning: "bg-teal-500",
  self_regard: "bg-rose-400",
  vitality: "bg-orange-500",
};

const LEVEL_WIDTH: Record<string, string> = {
  low: "w-1/4",
  medium: "w-1/2",
  high: "w-3/4",
};

const TREND_ARROWS: Record<string, string> = {
  improving: "\u2191",
  stable: "\u2192",
  declining: "\u2193",
};

const DOMAIN_ORDER: DomainKey[] = [
  "connection",
  "momentum",
  "groundedness",
  "meaning",
  "self_regard",
  "vitality",
];

export function WellbeingMap({ formulation }: WellbeingMapProps) {
  const signals = formulation.domainSignals;
  const domains = DOMAIN_ORDER.filter((d) => signals[d]);

  if (domains.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Your Wellbeing Map</h2>
      <p className="mb-5 text-xs text-foreground/40">Six dimensions of how you're doing</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {domains.map((domain) => {
          const signal = signals[domain];
          if (!signal) return null;
          return (
            <div key={domain} className="rounded-xl border border-foreground/5 bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground/70">
                  {DOMAIN_LABELS[domain]}
                </span>
                <span className="text-xs text-foreground/40">
                  {TREND_ARROWS[signal.trend]} {signal.trend}
                </span>
              </div>
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/5">
                <div
                  className={`h-full rounded-full ${DOMAIN_BG[domain]} ${LEVEL_WIDTH[signal.level]}`}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-foreground/50">{signal.evidence}</p>
              {signal.contributions && signal.contributions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {signal.contributions.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] text-foreground/40"
                    >
                      {c.assessmentType.toUpperCase()}
                      {c.subscale ? `.${c.subscale}` : ""}
                      <span className="ml-0.5 font-mono">
                        {(c.normalizedScore * 100).toFixed(0)}%
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
