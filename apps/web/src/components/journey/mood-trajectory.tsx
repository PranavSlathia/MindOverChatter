import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimelineMood } from "@/stores/journey-store.js";

interface MoodTrajectoryProps {
  moods: TimelineMood[];
  direction: "improving" | "stable" | "declining";
  period: string;
}

const SAGE_GREEN = "#7c9a82";
const WARM_LAVENDER = "#b8a9c9";

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function MoodTrajectory({ moods, direction, period }: MoodTrajectoryProps) {
  if (moods.length === 0) {
    return (
      <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Mood Trajectory</h3>
        <p className="text-xs text-foreground/50">
          No mood entries yet. Your mood trends will appear here as you log them.
        </p>
      </div>
    );
  }

  const sorted = [...moods].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const chartData = sorted.map((m) => ({
    date: formatDate(m.createdAt),
    valence: Math.round(m.valence * 100) / 100,
    arousal: Math.round(m.arousal * 100) / 100,
  }));

  const trendLabel =
    direction === "improving"
      ? "Trending upward"
      : direction === "declining"
        ? "Trending downward"
        : "Holding steady";

  return (
    <div className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Mood Trajectory</h3>
        <span className="text-xs text-foreground/50">
          {trendLabel} over {period}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="valenceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SAGE_GREEN} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SAGE_GREEN} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="arousalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={WARM_LAVENDER} stopOpacity={0.3} />
              <stop offset="95%" stopColor={WARM_LAVENDER} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#2d3436" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[-1, 1]}
            tick={{ fontSize: 10, fill: "#2d3436" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#f5f0e8",
              border: "1px solid #e8e0d4",
              borderRadius: "8px",
              fontSize: "11px",
            }}
          />
          <Area
            type="monotone"
            dataKey="valence"
            name="Valence"
            stroke={SAGE_GREEN}
            strokeWidth={2}
            fill="url(#valenceGrad)"
          />
          <Area
            type="monotone"
            dataKey="arousal"
            name="Arousal"
            stroke={WARM_LAVENDER}
            strokeWidth={2}
            fill="url(#arousalGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
