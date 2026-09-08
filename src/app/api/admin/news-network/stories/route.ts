import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/news-network/stories
 *
 * The editorial queue. Every story is returned with the source material
 * it was built from, its attribution records, and every generated
 * rendition including failed ones and their validation reports - so an
 * admin can always compare what the sources said against what the model
 * wrote, in every language.
 *
 * ?status=NEW|READY|PUBLISHED|REJECTED|SUPERSEDED
 * ?sensitive=true   the human-review queue
 * ?limit=50
 */
export async function GET(request: NextRequest) {
  const staffCheck = await requireStaff();
  if (!staffCheck.authorized) return staffCheck.response;

  try {
    const { searchParams } = new URL(request.url);

    const where: Prisma.NewsStoryWhereInput = {};

    const status = searchParams.get("status");
    if (status) {
      const allowed = ["NEW", "READY", "PUBLISHED", "REJECTED", "SUPERSEDED"];
      if (!allowed.includes(status.toUpperCase())) {
        return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
      }
      where.status = status.toUpperCase() as Prisma.NewsStoryWhereInput["status"];
    }

    if (searchParams.get("sensitive") === "true") where.sensitive = true;
    if (searchParams.get("travel") === "true") where.isTravel = true;

    const requestedLimit = Number(searchParams.get("limit") || "50");
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 100)
        : 50;

    const stories = await prisma.newsStory.findMany({
      where,
      orderBy: [{ isBreaking: "desc" }, { importance: "desc" }, { firstSeenAt: "desc" }],
      take: limit,
      include: {
        references: {
          include: { source: { select: { id: true, name: true, publisher: true, trustTier: true } } },
        },
        renditions: true,
        publications: {
          select: { id: true, language: true, status: true, publishedAt: true, postId: true, feedId: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, stories },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ZRP News admin stories error:", error);
    return NextResponse.json({ success: false, error: "Failed to load stories" }, { status: 500 });
  }
}
