export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
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
