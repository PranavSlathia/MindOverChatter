import type { DomainKey, JourneyFormulation } from "@/stores/journey-store.js";

interface HowYoureDoingProps {
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

const DOMAIN_CHIP_COLORS: Record<string, string> = {
  connection: "bg-[#7c9a82]/10 border-[#7c9a82]/20 text-[#7c9a82]",
  momentum: "bg-amber-50 border-amber-200 text-amber-700",
  groundedness: "bg-[#b8a9c9]/10 border-[#b8a9c9]/20 text-[#b8a9c9]",
  meaning: "bg-teal-50 border-teal-200 text-teal-700",
  self_regard: "bg-rose-50 border-rose-200 text-rose-600",
  vitality: "bg-orange-50 border-orange-200 text-orange-600",
};

const DOMAIN_DOT_COLORS: Record<string, string> = {
  connection: "bg-[#7c9a82]",
  momentum: "bg-amber-500",
  groundedness: "bg-[#b8a9c9]",
  meaning: "bg-teal-500",
  self_regard: "bg-rose-400",
  vitality: "bg-orange-500",
};

const DOMAIN_BAR_BG: Record<DomainKey, string> = {
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

export function HowYoureDoing({ formulation }: HowYoureDoingProps) {
  const hasActiveStates = formulation.activeStates.length > 0;
  const signals = formulation.domainSignals;
  const activeDomains = DOMAIN_ORDER.filter((d) => signals[d]);
  const hasDomainSignals = activeDomains.length > 0;

  if (!hasActiveStates && !hasDomainSignals) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">How You're Doing</h2>
      <p className="mb-5 text-xs text-foreground/40">What we've been noticing across your sessions</p>

      {/* Active States as chips/pills */}
      {hasActiveStates && (
        <div className="mb-5">
          <div className="flex flex-wrap gap-2">
            {formulation.activeStates.map((state, i) => {
              const colors =
                DOMAIN_CHIP_COLORS[state.domain] ??
                "bg-foreground/5 border-foreground/10 text-foreground/60";
              const dotColor = DOMAIN_DOT_COLORS[state.domain] ?? "bg-foreground/30";
              const opacityClass =
                state.confidence >= 0.7
                  ? "opacity-100"
                  : state.confidence >= 0.4
                    ? "opacity-80"
                    : "opacity-60";

              return (
                <div
                  key={`${state.label}-${i}`}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${colors} ${opacityClass}`}
                  title={state.signal}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
                  <span className="text-xs font-medium">{state.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Domain Signals as compact bar grid */}
      {hasDomainSignals && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {activeDomains.map((domain) => {
            const signal = signals[domain];
            if (!signal) return null;
            return (
              <div key={domain} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-foreground/60">
                  {DOMAIN_LABELS[domain]}
                </span>
                <div className="flex-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/5">
                    <div
                      className={`h-full rounded-full ${DOMAIN_BAR_BG[domain]} ${LEVEL_WIDTH[signal.level]}`}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-foreground/40">
                  {TREND_ARROWS[signal.trend]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
