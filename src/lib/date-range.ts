// ─── Shared admin-analytics date-range resolution ───────────────────
//
// Every admin analytics surface (the existing /api/admin/analytics and
// the new /api/admin/analytics/geography) needs the same "last 7/30/90
// days, or all time" selector - this was previously a single hard-coded
// `thirtyDaysAgo` computed inline in the analytics route with no way to
// change it. Centralized here so both routes (and any future one)
// resolve a range identically.

export type AnalyticsRange = "7" | "30" | "90" | "all";

export const ANALYTICS_RANGES: AnalyticsRange[] = ["7", "30", "90", "all"];

export interface ResolvedDateRange {
  /** Inclusive lower bound, or null for "all time" (no lower bound). */
  from: Date | null;
  to: Date;
  range: AnalyticsRange;
}

/**
 * Parses a `?range=` query-param value into a validated AnalyticsRange,
 * defaulting to "30" (preserving the previous hard-coded behavior of
 * every existing caller) for anything missing or unrecognized - never
 * throws on bad input.
 */
export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return value && (ANALYTICS_RANGES as string[]).includes(value) ? (value as AnalyticsRange) : "30";
}

export function resolveDateRange(range: AnalyticsRange, now: Date = new Date()): ResolvedDateRange {
  if (range === "all") {
    return { from: null, to: now, range };
  }
  const days = Number(range);
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to: now, range };
}
