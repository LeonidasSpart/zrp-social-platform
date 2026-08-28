import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";
import { parseCursorParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const { cursor, limit } = parseCursorParams(req);

    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true, isPrivate: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Private accounts: only the owner or an approved follower ────
    if (!(await canViewPrivateContent(session?.user?.id, user.id, user.isPrivate))) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // Cursor/paging is on the Follow row itself, not the follower's
    // user id (a user can appear only once here anyway, but the Follow
    // row's id is what the query's cursor actually points at).
    const rawFollowers = await prisma.follow.findMany({
      where: { followingId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            bio: true,
            badgeType: true,
          },
        },
      },
    });

    const { items: followers, nextCursor } = buildPage(rawFollowers, limit);

    let isFollowingMap = new Map();
    if (session && session.user) {
      const following = await prisma.follow.findMany({
        where: {
          followerId: session.user.id,
          followingId: { in: followers.map((f) => f.follower.id) },
        },
      });
      following.forEach((f) => isFollowingMap.set(f.followingId, true));
    }

    const result = followers.map((f) => ({
      ...f.follower,
      isFollowing: isFollowingMap.has(f.follower.id) || false,
    }));

    return NextResponse.json({ items: result, nextCursor });
  } catch (error) {
    console.error("Error fetching followers:", error);
    return NextResponse.json({ error: "Failed to fetch followers" }, { status: 500 });
  }
}
