"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DataPoint {
  month: string;
  score: number;
  rank: number;
}

interface Props {
  data: DataPoint[];
  metric?: "score" | "rank";
}

export function ScoreHistory({ data, metric = "score" }: Props) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No history data yet.</p>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" className="text-xs" />
        <YAxis
          domain={metric === "rank" ? ["dataMax", "dataMin"] : [0, 100]}
          className="text-xs"
          reversed={metric === "rank"}
        />
        <Tooltip />
        <Line
          type="monotone"
          dataKey={metric}
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
