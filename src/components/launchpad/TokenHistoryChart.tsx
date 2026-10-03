"use client";

// Split out of the token detail page so recharts (a genuinely heavy charting
// lib) loads in its own on-demand chunk via next/dynamic, matching the
// pattern already established in transparency/TransparencyCharts.tsx and
// admin/AdminAnalyticsCharts.tsx.
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import type { TranslationKey } from "@/lib/translations";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface HistoryChartPoint {
  timestamp: string;
  value: number | null;
}

export function TokenMetricChart({ points, t }: { points: HistoryChartPoint[]; t: T }) {
  const data = points
    .filter((p) => p.value !== null)
    .map((p) => ({ label: new Date(p.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), value: p.value }));

  if (data.length === 0) {
    return null;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={30} />
        <YAxis tick={{ fontSize: 10 }} width={56} domain={["auto", "auto"]} />
        <Tooltip formatter={(value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 6 })} />
        <Line type="monotone" dataKey="value" stroke="#FF2D2D" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
