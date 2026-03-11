import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MoodEntry } from "@/stores/mood-store.js";

interface MoodChartProps {
  entries: MoodEntry[];
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Theme colors matching index.css @theme block
const SAGE_GREEN = "#7c9a82";
const WARM_LAVENDER = "#b8a9c9";

export function MoodChart({ entries }: MoodChartProps) {
  if (entries.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-foreground/10 bg-white p-6">
        <p className="text-sm text-foreground/50">
          No mood entries yet. Log your first mood above to see trends.
        </p>
      </div>
    );
  }

  // Take last 30 entries and format for Recharts
  const chartData = entries.slice(-30).map((entry) => ({
    date: formatDate(entry.createdAt),
    dateTime: formatDateTime(entry.createdAt),
    valence: Math.round(entry.valence * 100) / 100,
    arousal: Math.round(entry.arousal * 100) / 100,
  }));

  return (
    <div
      className="rounded-2xl border border-foreground/10 bg-white p-6 shadow-sm"
      role="img"
      aria-label="Mood trends chart showing valence and arousal over time"
    >
      <h3 className="mb-4 text-sm font-semibold text-foreground">Mood Trends</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d4" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#2d3436" }} tickLine={false} />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 11, fill: "#2d3436" }} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#f5f0e8",
              border: "1px solid #e8e0d4",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(_, payload) => {
              if (payload?.[0]?.payload?.dateTime) {
                return payload[0].payload.dateTime as string;
              }
              return "";
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            iconType="circle"
            iconSize={8}
          />
          <Line
            type="monotone"
            dataKey="valence"
            name="Valence"
            stroke={SAGE_GREEN}
            strokeWidth={2}
            dot={{ r: 3, fill: SAGE_GREEN }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="arousal"
            name="Arousal"
            stroke={WARM_LAVENDER}
            strokeWidth={2}
            dot={{ r: 3, fill: WARM_LAVENDER }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
