import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const blockedUsers = await prisma.blocked.findMany({
      where: { blockerId: session.user.id },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
            bio: true,
            _count: {
              select: { followers: true, following: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      blockedUsers.map((b) => ({
        ...b.blocked,
        blockedAt: b.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    return NextResponse.json(
      { error: "Failed to fetch blocked users" },
      { status: 500 }
    );
  }
}
