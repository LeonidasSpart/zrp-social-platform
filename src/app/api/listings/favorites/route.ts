export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// ─── GET: the current user's favorited listings ──────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const favorites = await prisma.listingFavorite.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        listing: {
          select: {
            id: true,
            category: true,
            title: true,
            price: true,
            currency: true,
            priceOnRequest: true,
            location: true,
            imageUrls: true,
            videoUrl: true,
            status: true,
            seller: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
            _count: { select: { favorites: true } },
          },
        },
      },
    });

    // A favorited listing can later be sold/removed/expired - filter
    // those out rather than showing a saved item that's no longer
    // actually available, same spirit as bookmarks skipping deleted posts.
    const listings = favorites
      .filter((f) => f.listing.status === "ACTIVE")
      .map((f) => f.listing);

    return jsonWithDecimals({ listings });
  } catch (error) {
    console.error("Error fetching favorite listings:", error);
    return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
  }
}
