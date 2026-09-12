import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestedLimit = parseInt(req.nextUrl.searchParams.get("limit") || "10", 10);
    const take = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10, 1), 50);

    // ⚠️ PERFORMANCE: this used to fetch the user's entire follow list
    // into a JS array just to build a `notIn` exclusion - scaling with
    // however many accounts the viewer follows on every load of this
    // widget. A relation filter expresses "not already followed by me"
    // directly in SQL instead.
    const suggestions = await prisma.user.findMany({
      where: {
        id: { not: session.user.id },
        followers: {
          none: { followerId: session.user.id },
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        badgeType: true,
      },
      orderBy: {
        followers: { _count: "desc" },
      },
      take,
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Suggested users error:", error);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}
