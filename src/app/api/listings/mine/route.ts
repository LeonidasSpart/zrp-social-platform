export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

// ─── GET: the current user's own listings, every status ─────────────
// (seller dashboard - the one place a seller can see PENDING_REVIEW/
// REJECTED/EXPIRED listings, which the public browse endpoint hides.)
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const listings = await prisma.listing.findMany({
      where: { sellerId: token.id as string },
      orderBy: { createdAt: "desc" },
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
        rejectionReason: true,
        views: true,
        expiresAt: true,
        createdAt: true,
        _count: { select: { favorites: true } },
      },
    });

    return jsonWithDecimals({ listings });
  } catch (error) {
    console.error("Error fetching seller listings:", error);
    return NextResponse.json({ error: "Failed to fetch your listings" }, { status: 500 });
  }
}
