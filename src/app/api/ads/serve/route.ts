export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";

// ─── GET: return one eligible active ad for the feed to inject ──────
// Called by the feed roughly once every N posts (feed-side interleaving
// logic, not this route's concern) - this just picks *which* ad to show
// this time. Works for logged-out viewers too, same as the rest of the
// public feed.
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const viewerId = token?.id as string | undefined;

    // Minimal targeting: an untargeted campaign (targetCountries: [])
    // shows to everyone; a targeted one only shows to a signed-in viewer
    // whose normalized `User.countryCode` (ISO 3166-1 alpha-2, derived
    // from the free-text `country` via src/lib/geo/country.ts) is in
    // the list. A logged-out viewer only ever sees untargeted
    // campaigns, since their country isn't known without asking for it.
    //
    // ⚠️ This used to match `targetCountries` against the free-text
    // `User.country` field directly - since `targetCountries` is
    // documented/populated as ISO codes but `country` is whatever a
    // user typed ("Switzerland"/"Suisse"/"CH"/...), that comparison
    // would silently never match for the vast majority of profiles.
    // Nothing in the app currently writes `targetCountries` yet, so
    // this was latent rather than actively broken in production, but
    // any future admin UI that sets it must write ISO codes and rely on
    // this route comparing against `countryCode`, not `country`.
    const viewerCountry = viewerId
      ? (await prisma.user.findUnique({ where: { id: viewerId }, select: { countryCode: true } }))
          ?.countryCode
      : null;

    const now = new Date();
    const eligible = await prisma.adCampaign.findMany({
      where: {
        status: "ACTIVE",
        // Column-vs-column comparisons (budgetSpent < budgetTotal)
        // aren't expressible in Prisma's where clause directly, so
        // budgetSpent/budgetTotal are selected below and the comparison
        // happens in-memory on data already fetched in this one query -
        // not a second round-trip per campaign.
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
          {
            OR: [
              { targetCountries: { isEmpty: true } },
              ...(viewerCountry ? [{ targetCountries: { has: viewerCountry } }] : []),
            ],
          },
        ],
        // Don't show someone their own ad - wastes their budget for no
        // real marketing benefit.
        ...(viewerId ? { advertiserId: { not: viewerId } } : {}),
      },
      select: {
        id: true,
        targetUrl: true,
        budgetSpent: true,
        budgetTotal: true,
        post: {
          select: {
            id: true,
            content: true,
            imageUrl: true,
            imageUrls: true,
            mediaType: true,
            author: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
                badgeType: true,
              },
            },
          },
        },
      },
    });

    // ⚠️ Decimal instances must never be compared with plain `<`/`>` -
    // Decimal's valueOf() returns a string, so JS falls back to
    // lexicographic string comparison (e.g. "9.5" < "10.0" is FALSE,
    // since '9' > '1' as characters), not numeric comparison. This
    // silently mis-serves ads whose spend/budget happen to differ in
    // digit count. Always use the Decimal comparison methods instead.
    const withBudget = eligible.filter((c) => c.budgetSpent.lessThan(c.budgetTotal));

    if (withBudget.length === 0) {
      return NextResponse.json({ ad: null });
    }

    const chosen = withBudget[Math.floor(Math.random() * withBudget.length)];

    return NextResponse.json({
      ad: {
        campaignId: chosen.id,
        targetUrl: chosen.targetUrl,
        post: chosen.post,
      },
    });
  } catch (error) {
    console.error("Error serving ad:", error);
    return NextResponse.json({ ad: null });
  }
}
