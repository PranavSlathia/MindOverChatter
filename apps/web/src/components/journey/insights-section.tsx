import type { JourneyInsights } from "@/stores/journey-store.js";

interface InsightsSectionProps {
  insights: JourneyInsights;
}

export function InnerLandscape({ insights }: InsightsSectionProps) {
  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Your Inner Landscape</h2>
      <p className="mb-4 text-xs text-foreground/40">What we've noticed together</p>

      <p className="mb-4 text-sm leading-relaxed text-foreground/80">
        {insights.clinicalUnderstanding}
      </p>

      <p className="text-sm leading-relaxed text-foreground/70 italic">{insights.userReflection}</p>

      {/* Pattern tags */}
      {(insights.patterns.wins.length > 0 ||
        insights.patterns.recurring_triggers.length > 0 ||
        insights.patterns.unresolved_threads.length > 0) && (
        <div className="mt-5 space-y-3">
          {insights.patterns.wins.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground/50">Wins</p>
              <div className="flex flex-wrap gap-1.5">
                {insights.patterns.wins.map((w) => (
                  <span
                    key={w.id}
                    className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                  >
                    {w.content.length > 60 ? `${w.content.slice(0, 60)}...` : w.content}
                  </span>
                ))}
              </div>
            </div>
          )}

          {insights.patterns.recurring_triggers.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground/50">Areas for attention</p>
              <div className="flex flex-wrap gap-1.5">
                {insights.patterns.recurring_triggers.map((t) => (
                  <span
                    key={t.id}
                    className="inline-block rounded-full bg-accent/20 px-3 py-1 text-xs text-foreground/70"
                  >
                    {t.content.length > 60 ? `${t.content.slice(0, 60)}...` : t.content}
                  </span>
                ))}
              </div>
            </div>
          )}

          {insights.patterns.unresolved_threads.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground/50">Open threads</p>
              <div className="flex flex-wrap gap-1.5">
                {insights.patterns.unresolved_threads.map((t) => (
                  <span
                    key={t.id}
                    className="inline-block rounded-full bg-foreground/5 px-3 py-1 text-xs text-foreground/60"
                  >
                    {t.content.length > 60 ? `${t.content.slice(0, 60)}...` : t.content}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function NextSteps({ insights }: InsightsSectionProps) {
  if (insights.actionItems.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Next Steps</h2>
      <p className="mb-4 text-xs text-foreground/40">
        Practical suggestions based on your patterns
      </p>

      <ul className="space-y-2.5">
        {insights.actionItems.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-foreground/20">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
            </span>
            <span className="text-sm leading-relaxed text-foreground/80">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
