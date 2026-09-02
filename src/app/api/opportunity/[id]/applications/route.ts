export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSessionAdmin } from "@/lib/admin";
import { parseCursorParams, buildPage } from "@/lib/pagination";

const APPLICANT_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: poster (or staff) reviews applicants for their listing ────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: listingId } = await params;

  try {
    const listing = await prisma.opportunityListing.findUnique({ where: { id: listingId }, select: { posterId: true } });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const isOwner = listing.posterId === session.user.id;
    const isStaff = isOwner ? false : await isSessionAdmin(session);
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { cursor, limit } = parseCursorParams(req);
    const applications = await prisma.opportunityApplication.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { applicant: { select: APPLICANT_SELECT } },
    });

    const { items, nextCursor } = buildPage(applications, limit);
    return NextResponse.json({ applications: items, nextCursor });
  } catch (error) {
    console.error("Error fetching opportunity applications:", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}
