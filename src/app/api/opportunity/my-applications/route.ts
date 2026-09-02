export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// ─── GET: my own applications across all listings ────────────────────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { cursor, limit } = parseCursorParams(req);
    const applications = await prisma.opportunityApplication.findMany({
      where: { applicantId: token.id as string },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        listing: {
          select: { id: true, type: true, title: true, organizationName: true, status: true },
        },
      },
    });

    const { items, nextCursor } = buildPage(applications, limit);
    return NextResponse.json({ applications: items, nextCursor });
  } catch (error) {
    console.error("Error fetching my opportunity applications:", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}
