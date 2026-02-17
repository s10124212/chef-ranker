"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ScoreBreakdown } from "@/types";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706"];

const LABELS: Record<string, string> = {
  formalAccolades: "Accolades",
  careerTrack: "Career",
  publicSignals: "Public",
  peerStanding: "Peers",
};

interface Props {
  data: { name: string; breakdown: ScoreBreakdown }[];
}

export function ScoreRadar({ data }: Props) {
  const categories = Object.keys(LABELS);
  const chartData = categories.map((key) => {
    const point: Record<string, unknown> = { category: LABELS[key] };
    for (const d of data) {
      point[d.name] = d.breakdown[key as keyof ScoreBreakdown];
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="category" className="text-xs" />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
        {data.map((d, i) => (
          <Radar
            key={d.name}
            name={d.name}
            dataKey={d.name}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.15}
          />
        ))}
        {data.length > 1 && <Legend />}
      </RadarChart>
    </ResponsiveContainer>
  );
}
