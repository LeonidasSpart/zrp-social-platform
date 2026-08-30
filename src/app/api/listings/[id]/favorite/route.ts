import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "listing-favorite" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listingId = params.id;
  const userId = session.user.id;

  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const existing = await prisma.listingFavorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });

    if (existing) {
      await prisma.listingFavorite.delete({
        where: { userId_listingId: { userId, listingId } },
      });
      return NextResponse.json({ favorited: false });
    } else {
      await prisma.listingFavorite.create({ data: { userId, listingId } });
      return NextResponse.json({ favorited: true });
    }
  } catch (error) {
    console.error("Listing favorite error:", error);
    return NextResponse.json({ error: "Failed to toggle favorite" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const favorite = await prisma.listingFavorite.findUnique({
      where: { userId_listingId: { userId: session.user.id, listingId: params.id } },
    });
    return NextResponse.json({ favorited: !!favorite });
  } catch (error) {
    console.error("Listing favorite check error:", error);
    return NextResponse.json({ error: "Failed to check favorite" }, { status: 500 });
  }
}
