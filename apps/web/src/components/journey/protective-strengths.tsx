import type { JourneyFormulation } from "@/stores/journey-store.js";

interface ProtectiveStrengthsProps {
  formulation: JourneyFormulation;
}

const SOURCE_ICON: Record<string, string> = {
  win: "✦",
  goal: "◎",
  relationship: "♡",
};

const SOURCE_COLORS: Record<string, string> = {
  win: "bg-[#7c9a82]/10 border-[#7c9a82]/20 text-[#7c9a82]",
  goal: "bg-teal-50 border-teal-200 text-teal-700",
  relationship: "bg-[#b8a9c9]/10 border-[#b8a9c9]/20 text-[#b8a9c9]",
  coping_strategy: "bg-amber-50 border-amber-200 text-amber-700",
};

export function ProtectiveStrengths({ formulation }: ProtectiveStrengthsProps) {
  const strengths = formulation.formulation.protectiveStrengths;
  if (!strengths || strengths.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">What You're Building</h2>
      <p className="mb-5 text-xs text-foreground/40">
        Things you've been working on and the support around you
      </p>

      <div className="flex flex-wrap gap-2">
        {strengths.map((strength, i) => {
          const icon = SOURCE_ICON[strength.sourceType] ?? "•";
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
    </section>
  );
}
