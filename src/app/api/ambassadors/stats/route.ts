import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/ambassadors/stats
 *
 * Real, aggregate, platform-wide numbers for the hero/movement section
 * - total approved ambassadors and how many distinct countries have at
 * least one. Both are plain COUNT/groupBy queries against
 * AmbassadorProfile; neither is estimated, rounded up for effect, or
 * backed by a trend/growth figure ZRP has no historical baseline to
 * compute honestly.
 */
export async function GET() {
  try {
    const [totalAmbassadors, countriesRepresented] = await Promise.all([
      prisma.ambassadorProfile.count({ where: { status: "APPROVED" } }),
      prisma.ambassadorProfile.groupBy({
        by: ["countryCode"],
        where: { status: "APPROVED" },
      }),
    ]);

    return NextResponse.json({
      totalAmbassadors,
      countriesRepresented: countriesRepresented.length,
    });
  } catch (error) {
    console.error("GET /api/ambassadors/stats error:", error);
    return NextResponse.json({ error: "Failed to load ambassador stats" }, { status: 500 });
  }
}
