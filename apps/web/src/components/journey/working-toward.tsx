import type { TherapyPlanGoal } from "@/stores/journey-store.js";

interface WorkingTowardProps {
  goals: TherapyPlanGoal[];
}

const PROGRESS_LABEL: Record<TherapyPlanGoal["progress"], string> = {
  nascent: "Just beginning",
  building: "Growing",
  established: "Taking root",
};

const PROGRESS_DOT: Record<TherapyPlanGoal["progress"], string> = {
  nascent: "bg-foreground/20",
  building: "bg-primary/40",
  established: "bg-primary",
};

export function WorkingToward({ goals }: WorkingTowardProps) {
  if (goals.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">What We're Working Toward</h2>
      <p className="mt-0.5 mb-4 text-xs text-foreground/50">Your evolving focus, in your own time.</p>

      <div className="space-y-3">
        {goals.map((goal, i) => (
          <div
            key={`goal-${i}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-foreground/8 bg-foreground/[0.02] px-4 py-3"
          >
            <span className="text-sm leading-snug text-foreground/80">{goal.visible_label}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${PROGRESS_DOT[goal.progress]}`}
                aria-hidden="true"
              />
              <span className="text-[11px] text-foreground/40">{PROGRESS_LABEL[goal.progress]}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
