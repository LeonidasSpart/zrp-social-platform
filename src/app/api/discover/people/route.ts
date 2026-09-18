import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/auth-guards";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// ─── People near you / businesses near you (Phase 11/15) ───────────
//
// A browse surface, not a text search - /api/search already covers
// "find this specific person by name", this covers "who's around me".
// Reuses the exact same exclusion-list (blocked/blockers/muted) and
// `banned: false` pattern /api/search's own user-search branch already
// established, so results are consistent with what a viewer would find
// through search too.
//
// Deliberately requires authentication: this is inherently "relative
// to where I am", and unlike the ad-serve route (which degrades to an
// untargeted result for a logged-out viewer), there is no honest
// untargeted fallback for "people near you" - showing it to a
// logged-out visitor would mean guessing their country, which this
// feature never does.
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return auth.response;

  try {
    const viewer = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { countryCode: true },
    });

    if (!viewer?.countryCode) {
      // Never guessed - a viewer with no known country simply has no
      // "near you" result set yet, distinct from an empty result
      // because nobody else is nearby.
      return NextResponse.json({ users: [], nextCursor: null, reason: "unknown_viewer_country" });
    }

    const badgeType = req.nextUrl.searchParams.get("badgeType");
    const organizationOnly = badgeType === "organization";

    const [blocked, blockers, muted] = await Promise.all([
      prisma.blocked.findMany({ where: { blockerId: auth.userId }, select: { blockedId: true } }),
      prisma.blocked.findMany({ where: { blockedId: auth.userId }, select: { blockerId: true } }),
      prisma.mute.findMany({ where: { muterId: auth.userId }, select: { mutedId: true } }),
    ]);
    const excludedIds = [
      auth.userId,
      ...blocked.map((b) => b.blockedId),
      ...blockers.map((b) => b.blockerId),
      ...muted.map((m) => m.mutedId),
    ];

    const { cursor, limit } = parseCursorParams(req, 20);

    const users = await prisma.user.findMany({
      where: {
        countryCode: viewer.countryCode,
        id: { notIn: excludedIds },
        banned: false,
        ...(organizationOnly ? { badgeType: "organization" } : {}),
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        badgeType: true,
        bio: true,
        category: true,
        headline: true,
        company: true,
      },
      orderBy: { id: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const { items, nextCursor } = buildPage(users, limit);
    return NextResponse.json({ users: items, nextCursor });
  } catch (error) {
    console.error("People discovery error:", error);
    return NextResponse.json({ error: "Failed to load nearby people" }, { status: 500 });
  }
}
