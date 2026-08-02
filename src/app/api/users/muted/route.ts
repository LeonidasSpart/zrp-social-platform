import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── GET /api/users/muted – Get all muted users ────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const mutedUsers = await prisma.mute.findMany({
      where: {
        muterId: session.user.id,
      },
      include: {
        muted: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
            bio: true,
            _count: {
              select: {
                followers: true,
                following: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      mutedUsers.map((m) => ({
        ...m.muted,
        mutedAt: m.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching muted users:", error);
    return NextResponse.json(
      { error: "Failed to fetch muted users" },
      { status: 500 }
    );
  }
}
