import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // ─── CASE-INSENSITIVE USER LOOKUP ──────────────────────────────
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: params.username,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        location: true,
        country: true,
        website: true,
        createdAt: true,
        usernameChangedAt: true,
        isPrivate: true,
        badgeType: true,
        isAdmin: true,
        pinnedPostId: true, // ✅ critical for pinned posts
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    // ─── USER NOT FOUND ─────────────────────────────────────────────
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── FOLLOW / BLOCK STATUS ──────────────────────────────────────
    let isFollowing = false;
    let isBlocked = false;

    if (session?.user?.id && session.user.id !== user.id) {
      // Check if viewer follows target
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: session.user.id,
            followingId: user.id,
          },
        },
      });
      isFollowing = !!follow;

      // Check if viewer has blocked target
      const block = await prisma.blocked.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: session.user.id,
            blockedId: user.id,
          },
        },
      });
      isBlocked = !!block;
    }

    // ─── RESPONSE ────────────────────────────────────────────────────
    return NextResponse.json({
      ...user,
      isFollowing,
      isBlocked,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
