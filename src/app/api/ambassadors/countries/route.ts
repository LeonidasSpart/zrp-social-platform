import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAllCountries } from "@/lib/ambassadors/countries";
import type { Language } from "@/lib/translations";

const SUPPORTED_LANGUAGES: Language[] = ["en", "fr", "de", "it", "sq", "es", "ru", "ar", "zh", "tr", "id"];

/**
 * GET /api/ambassadors/countries?lang=en
 *
 * The complete, unfiltered dataset behind the ZRP Global Ambassadors
 * world map and country explorer: every one of the 250 countries and
 * territories in src/lib/ambassadors/countries.ts, left-joined with
 * the REAL count of approved ambassadors per country - never a
 * curated subset, and a country with zero ambassadors is present in
 * this response with ambassadors: 0, not omitted.
 *
 * `communities` and `activeMembers` are always 0 today - there is no
 * Community model and no reliable per-country membership signal
 * anywhere else in ZRP yet (User.country is free text, not validated
 * against an ISO code, so it isn't a safe source for a number this
 * page presents as fact). The fields exist so the map/UI are already
 * shaped for when that data exists; they are real zeros, not invented
 * placeholder numbers.
 */
export async function GET(request: NextRequest) {
  try {
    const langParam = request.nextUrl.searchParams.get("lang") as Language | null;
    const language: Language =
      langParam && SUPPORTED_LANGUAGES.includes(langParam) ? langParam : "en";

    const [countries, grouped] = await Promise.all([
      Promise.resolve(getAllCountries(language)),
      prisma.ambassadorProfile.groupBy({
        by: ["countryCode"],
        where: { status: "APPROVED" },
        _count: { _all: true },
      }),
    ]);

    const ambassadorCountByCode = new Map<string, number>();
    for (const row of grouped) {
      ambassadorCountByCode.set(row.countryCode, row._count._all);
    }

    const results = countries.map((country) => ({
      code: country.code,
      name: country.name,
      region: country.region,
      ambassadors: ambassadorCountByCode.get(country.code) ?? 0,
      communities: 0,
      activeMembers: 0,
    }));

    return NextResponse.json({ countries: results, total: results.length });
  } catch (error) {
    console.error("GET /api/ambassadors/countries error:", error);
    return NextResponse.json({ error: "Failed to load ambassador countries" }, { status: 500 });
  }
}
