export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// ─── GET: my own opportunity listings, any status ────────────────────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { cursor, limit } = parseCursorParams(req);
    const listings = await prisma.opportunityListing.findMany({
      where: { posterId: token.id as string },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { _count: { select: { applications: true } } },
    });

    const { items, nextCursor } = buildPage(listings, limit);
    return NextResponse.json({ listings: items, nextCursor });
  } catch (error) {
    console.error("Error fetching my opportunity listings:", error);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}
