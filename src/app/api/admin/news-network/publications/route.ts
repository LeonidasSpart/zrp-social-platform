import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/news-network/publications
 *
 * Publication history: what went out, to which feed, in which language,
 * from which story, with the post it produced. Also surfaces SCHEDULED
 * items so an admin can see what is queued before it appears, and
 * FAILED ones with the reason.
 *
 * ?status=SCHEDULED|PUBLISHED|FAILED|REMOVED
 * ?feedId= &limit=
 */
export async function GET(request: NextRequest) {
  const staffCheck = await requireStaff();
  if (!staffCheck.authorized) return staffCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const where: Prisma.NewsPublicationWhereInput = {};

    const status = searchParams.get("status");
    if (status) {
      const allowed = ["SCHEDULED", "PUBLISHED", "FAILED", "REMOVED"];
      if (!allowed.includes(status.toUpperCase())) {
        return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
      }
      where.status = status.toUpperCase() as Prisma.NewsPublicationWhereInput["status"];
    }

    const feedId = searchParams.get("feedId");
    if (feedId) where.feedId = feedId;

    const requestedLimit = Number(searchParams.get("limit") || "50");
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 100)
        : 50;

    const publications = await prisma.newsPublication.findMany({
      where,
      orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { scheduledFor: "desc" }],
      take: limit,
      include: {
        feed: { select: { key: true, displayName: true, user: { select: { username: true } } } },
        rendition: { select: { headline: true, language: true, status: true } },
        story: {
          select: {
            id: true,
            title: true,
            topic: true,
            region: true,
            country: true,
            confidence: true,
            sensitive: true,
            correctionNote: true,
            references: { select: { url: true, source: { select: { publisher: true } } } },
          },
        },
      },
    });

    return NextResponse.json(
      { success: true, publications },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ZRP News admin publications error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load publications" },
      { status: 500 }
    );
  }
}
