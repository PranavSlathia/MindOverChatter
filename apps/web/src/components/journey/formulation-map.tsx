import type { JourneyFormulation } from "@/stores/journey-store.js";

interface FormulationMapProps {
  formulation: JourneyFormulation;
}

export function FormulationMap({ formulation }: FormulationMapProps) {
  const { roots, recentActivators, perpetuatingCycles } = formulation.formulation;

  const hasRoots = roots.length > 0;
  const hasActivators = recentActivators.length > 0;
  const hasCycles = perpetuatingCycles.length > 0;

  if (!hasRoots && !hasActivators && !hasCycles) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Patterns We're Noticing</h2>
      <p className="mb-5 text-xs text-foreground/40">
        {formulation.dataConfidence === "emerging"
          ? "This is an emerging picture \u2014 it will deepen with more conversations"
          : "Patterns and connections from your sessions"}
      </p>

      <div className="space-y-5">
        {/* Where this may come from */}
        {hasRoots && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-foreground/50 uppercase">
              Where this may come from
            </h3>
            <div className="space-y-2">
              {roots.map((root, i) => (
                <div
                  key={`root-${i}`}
                  className="rounded-lg border border-foreground/5 bg-muted/30 px-3.5 py-2.5"
                >
                  <p className="text-sm leading-relaxed text-foreground/70">{root.content}</p>
                  <span className="mt-1 inline-block text-[10px] text-foreground/30">
                    {root.sourceType.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent triggers */}
        {hasActivators && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-foreground/50 uppercase">
              Recent triggers
            </h3>
            <div className="space-y-2">
              {recentActivators.map((act, i) => (
                <div
                  key={`act-${i}`}
                  className="rounded-lg border border-amber-100 bg-amber-50/50 px-3.5 py-2.5"
                >
                  <p className="text-sm leading-relaxed text-foreground/70">{act.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patterns that keep things going */}
        {hasCycles && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-foreground/50 uppercase">
              Patterns that keep things going
            </h3>
            <div className="space-y-2">
              {perpetuatingCycles.map((cycle, i) => (
                <div
                  key={`cycle-${i}`}
                  className="rounded-lg border border-foreground/5 bg-muted/30 px-3.5 py-2.5"
                >
                  <p className="text-sm leading-relaxed text-foreground/70">
                    When <span className="font-medium">{cycle.pattern}</span>, {cycle.mechanism}
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
