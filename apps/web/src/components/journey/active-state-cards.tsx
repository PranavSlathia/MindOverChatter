import type { JourneyFormulation } from "@/stores/journey-store.js";

interface ActiveStateCardsProps {
  formulation: JourneyFormulation;
}

const DOMAIN_COLORS: Record<string, string> = {
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

export function ActiveStateCards({ formulation }: ActiveStateCardsProps) {
  if (formulation.activeStates.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <p className="mb-4 text-xs font-medium tracking-wide text-foreground/40 uppercase">
        We've been noticing...
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {formulation.activeStates.map((state, i) => {
          const colors =
            DOMAIN_COLORS[state.domain] ??
            "bg-foreground/5 border-foreground/10 text-foreground/60";
          const dotColor = DOMAIN_DOT_COLORS[state.domain] ?? "bg-foreground/30";
          // Visual weight: higher confidence = full opacity, lower = lighter
          const opacityClass =
            state.confidence >= 0.7
              ? "opacity-100"
              : state.confidence >= 0.4
                ? "opacity-80"
                : "opacity-60";

          return (
            <div
              key={`${state.label}-${i}`}
              className={`flex min-w-[180px] shrink-0 flex-col gap-2 rounded-xl border p-4 ${colors} ${opacityClass}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                <span className="text-sm font-medium">{state.label}</span>
              </div>
              <p className="text-xs leading-relaxed opacity-70">{state.signal}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
