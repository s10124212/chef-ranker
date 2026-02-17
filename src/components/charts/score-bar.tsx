"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ScoreBreakdown, ScoringWeights } from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";

const COLORS: Record<string, string> = {
  formalAccolades: "#2563eb",
  careerTrack: "#16a34a",
  publicSignals: "#8b5cf6",
  peerStanding: "#06b6d4",
};

const LABELS: Record<string, string> = {
  formalAccolades: "Accolades",
  careerTrack: "Career",
  publicSignals: "Public",
  peerStanding: "Peers",
};

interface Props {
  breakdown: ScoreBreakdown;
  weights?: ScoringWeights;
}

export function ScoreBar({ breakdown, weights = DEFAULT_WEIGHTS }: Props) {
  const data = Object.entries(breakdown).map(([key, raw]) => ({
    name: LABELS[key] || key,
    raw,
    weighted: Math.round(raw * (weights[key as keyof ScoringWeights] || 0) * 10) / 10,
    color: COLORS[key] || "#666",
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" domain={[0, 100]} />
        <YAxis type="category" dataKey="name" width={80} className="text-xs" />
        <Tooltip
          formatter={(value) => [(value as number).toFixed(1)]}
        />
        <Bar dataKey="raw" name="Raw Score" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
