import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { parseAnalyticsRange, resolveDateRange } from "@/lib/date-range";
import { REGION_BY_CODE, type ZrpRegion } from "@/lib/ambassadors/countries";

// ─── Admin geography / acquisition / platform / language analytics ──
//
// Companion to /api/admin/analytics (which covers content/engagement
// totals): this route answers "where do our users come from" per
// docs/user-geography-and-acquisition.md. Every breakdown here is a
// real Prisma groupBy over User.{countryCode,signupCountryCode,
// signupSource,signupPlatform,languageCode} - no fabricated or
// estimated numbers, and no per-user rows (email, exact IP, name) are
// ever included, only aggregate counts. See the definitions doc for
// what each field means and why current-country and signup-country are
// tracked separately (Phase 6 historical integrity).
//
// Small-cohort privacy: any bucket with fewer than MIN_COHORT users is
// folded into "OTHER" rather than named individually, so a single
// country with e.g. 1-2 users can't be singled out in the breakdown.

const MIN_COHORT = 3;
const OTHER_BUCKET = "OTHER";
const UNKNOWN_BUCKET = "UNKNOWN";

function bucketSmallCohorts(rows: { key: string; count: number }[]): { key: string; count: number }[] {
  const kept: { key: string; count: number }[] = [];
  let otherCount = 0;
  for (const row of rows) {
    if (row.key !== UNKNOWN_BUCKET && row.count < MIN_COHORT) {
      otherCount += row.count;
    } else {
      kept.push(row);
    }
  }
  const result = kept.sort((a, b) => b.count - a.count);
  if (otherCount > 0) result.push({ key: OTHER_BUCKET, count: otherCount });
  return result;
}

function toRegionBreakdown(countryRows: { key: string; count: number }[]): { key: string; count: number }[] {
  const byRegion = new Map<string, number>();
  for (const row of countryRows) {
    const region: ZrpRegion | typeof UNKNOWN_BUCKET =
      row.key === UNKNOWN_BUCKET ? UNKNOWN_BUCKET : REGION_BY_CODE[row.key] ?? UNKNOWN_BUCKET;
    byRegion.set(region, (byRegion.get(region) ?? 0) + row.count);
  }
  return Array.from(byRegion.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const range = parseAnalyticsRange(new URL(req.url).searchParams.get("range"));
    const { from: rangeStart } = resolveDateRange(range);
    const rangeFilter = rangeStart ? { createdAt: { gte: rangeStart } } : {};

    const [
      currentCountryGroups,
      newSignupCountryGroups,
      sourceGroups,
      platformGroups,
      languageGroups,
      unknownCurrentCountry,
    ] = await Promise.all([
      // "Users by country" - a current snapshot across ALL users
      // (deliberately not range-filtered: this answers "where are our
      // users today", not "who joined recently"), grouped on the
      // normalized countryCode, never the free-text country.
      prisma.user.groupBy({ by: ["countryCode"], _count: true }),
      // "New users by country" - signup-time country, range-filtered,
      // immutable per-row so this never gets rewritten by a later
      // profile move (Phase 6).
      prisma.user.groupBy({ by: ["signupCountryCode"], _count: true, where: rangeFilter }),
      prisma.user.groupBy({ by: ["signupSource"], _count: true, where: rangeFilter }),
      prisma.user.groupBy({ by: ["signupPlatform"], _count: true, where: rangeFilter }),
      // Language is a current, mutable preference - not signup-time.
      prisma.user.groupBy({ by: ["languageCode"], _count: true }),
      prisma.user.count({ where: { countryCode: null } }),
    ]);

    const currentCountryRows = currentCountryGroups.map((g) => ({
      key: g.countryCode ?? UNKNOWN_BUCKET,
      count: g._count,
    }));
    const newSignupCountryRows = newSignupCountryGroups.map((g) => ({
      key: g.signupCountryCode ?? UNKNOWN_BUCKET,
      count: g._count,
    }));

    return NextResponse.json({
      range,
      geography: {
        byCountry: bucketSmallCohorts(currentCountryRows),
        byRegion: toRegionBreakdown(currentCountryRows),
        newUsersByCountry: bucketSmallCohorts(newSignupCountryRows),
        unknownCountryCount: unknownCurrentCountry,
      },
      acquisition: {
        bySource: sourceGroups
          .map((g) => ({ key: g.signupSource, count: g._count }))
          .sort((a, b) => b.count - a.count),
      },
      platform: {
        byPlatform: platformGroups
          .map((g) => ({ key: g.signupPlatform, count: g._count }))
          .sort((a, b) => b.count - a.count),
      },
      language: {
        byLanguage: bucketSmallCohorts(
          languageGroups.map((g) => ({ key: g.languageCode ?? UNKNOWN_BUCKET, count: g._count }))
        ),
      },
    });
  } catch (error) {
    console.error("Geography analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch geography analytics" }, { status: 500 });
  }
}
