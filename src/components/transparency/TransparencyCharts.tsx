"use client";

// Split out of transparency/page.tsx so recharts (a genuinely heavy charting
// lib) loads in its own on-demand chunk via next/dynamic, instead of
// bundling into the transparency route's initial client JS unconditionally.
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { TranslationKey } from "@/lib/translations";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function TransparencyTrendChart({
  seriesData,
  t,
}: {
  seriesData: { label: string; received: number; actioned: number }[];
  t: T;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={seriesData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="received" stroke="#9CA3AF" name={t("transparency.reportsReceivedLegend")} />
        <Line type="monotone" dataKey="actioned" stroke="#FF2D2D" name={t("transparency.reportsActionedLegend")} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TransparencyActionChart({
  byActionType,
  maxActionCount,
  actionKeys,
  t,
}: {
  byActionType: { actionType: string; count: number }[];
  maxActionCount: number;
  actionKeys: Record<string, TranslationKey>;
  t: T;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={byActionType} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} domain={[0, maxActionCount]} />
        <YAxis
          type="category"
          dataKey="actionType"
          tick={{ fontSize: 11 }}
          width={100}
          tickFormatter={(v: string) => t(actionKeys[v])}
        />
        <Tooltip formatter={(value) => [value, t("transparency.actionHeading")]} labelFormatter={(v) => t(actionKeys[v as string])} />
        <Bar dataKey="count" fill="#FF2D2D" />
      </BarChart>
    </ResponsiveContainer>
  );
}
