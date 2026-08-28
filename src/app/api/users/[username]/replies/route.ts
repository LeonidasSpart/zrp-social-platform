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
    const viewerId = session?.user?.id;
    const { cursor, limit } = parseCursorParams(req);

    // ─── Find profile owner ──────────────────────────────────────────
    const profileOwner = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true, isPrivate: true },
    });

    if (!profileOwner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Private accounts: only the owner or an approved follower ────
    if (!(await canViewPrivateContent(viewerId, profileOwner.id, profileOwner.isPrivate))) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // ─── Get excluded users (blocked + blockers + muted) ──────────
    let excludedAuthorIds: string[] = [];
    if (viewerId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: viewerId },
          select: { blockedId: true },
        }),
        prisma.blocked.findMany({
          where: { blockedId: viewerId },
          select: { blockerId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: viewerId },
          select: { mutedId: true },
        }),
      ]);
      const blockedIds = blocked.map(b => b.blockedId);
      const blockerIds = blockers.map(b => b.blockerId);
      const mutedIds = muted.map(m => m.mutedId);
      excludedAuthorIds = [...blockedIds, ...blockerIds, ...mutedIds];
    }

    // ─── If profile owner is excluded, return empty ──────────────────
    const isExcluded = excludedAuthorIds.includes(profileOwner.id);
    if (isExcluded) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // ─── Fetch replies (comments) by this user ──────────────────────
    const rawReplies = await prisma.comment.findMany({
      where: { authorId: profileOwner.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true, // ✅ included – frontend uses this for VerifiedBadge
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            author: {
              select: {
                username: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const { items: replies, nextCursor } = buildPage(rawReplies, limit);

    // ─── Format replies with replyTo context and postId ────────────
    const formattedReplies = replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      imageUrl: null,
      createdAt: reply.createdAt,
      author: reply.author, // includes badgeType
      postId: reply.post.id,
      replyTo: {
        id: reply.post.id,
        content: reply.post.content,
        author: {
          username: reply.post.author.username,
          name: reply.post.author.name,
        },
      },
    }));

    return NextResponse.json({ items: formattedReplies, nextCursor });
  } catch (error) {
    console.error("Error fetching replies:", error);
    return NextResponse.json({ error: "Failed to fetch replies" }, { status: 500 });
  }
}
