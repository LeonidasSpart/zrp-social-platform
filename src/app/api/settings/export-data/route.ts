import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Self-service data export: a real, working feature, not a claim. Every
// authenticated user can download a JSON copy of their own account data.
//
// Scoped deliberately to content that is unambiguously "this user's own
// data": account/profile fields, their own posts/comments/likes/reposts/
// bookmarks/stories, and who they follow/are followed by (usernames
// only). Private messages are intentionally NOT included in this first
// version - a conversation also contains another person's messages, and
// getting that boundary right needs its own careful pass rather than
// being folded into this one. Nothing here is a marketing claim; it's
// literally the query that produces the download.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [
      user,
      posts,
      comments,
      likes,
      reposts,
      bookmarks,
      stories,
      following,
      followers,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          name: true,
          email: true,
          bio: true,
          location: true,
          website: true,
          category: true,
          badgeType: true,
          isPrivate: true,
          plan: true,
          createdAt: true,
        },
      }),
      prisma.post.findMany({
        where: { authorId: userId },
        select: { id: true, content: true, createdAt: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: userId },
        select: { id: true, content: true, postId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.like.findMany({
        where: { userId },
        select: { postId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.repost.findMany({
        where: { userId },
        select: { postId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.bookmark.findMany({
        where: { userId },
        select: { postId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.story.findMany({
        where: { userId },
        select: { id: true, content: true, mediaUrl: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { following: { select: { username: true } }, createdAt: true },
      }),
      prisma.follow.findMany({
        where: { followingId: userId },
        select: { follower: { select: { username: true } }, createdAt: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: user,
      posts,
      comments,
      likes,
      reposts,
      bookmarks,
      stories,
      following: following.map((f) => ({ username: f.following.username, since: f.createdAt })),
      followers: followers.map((f) => ({ username: f.follower.username, since: f.createdAt })),
      note: "Private messages are not included in this export. Contact support if you need those as well.",
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="zrp-data-export-${user.username}.json"`,
      },
    });
  } catch (error) {
    console.error("Data export error:", error);
    return NextResponse.json({ error: "Failed to generate data export" }, { status: 500 });
  }
}
