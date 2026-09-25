import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifySubscribersOfNewPost } from "@/lib/post-subscriptions";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Require a secret key to prevent abuse. Deliberately fails CLOSED:
  // if CRON_SECRET isn't set on Railway, every request is now rejected
  // rather than silently accepted - the previous `if (secret && ...)`
  // meant a missing env var (Railway misconfiguration, typo in the
  // variable name, etc) turned this into a fully public, unauthenticated
  // endpoint with zero warning. Better to have scheduled posts not
  // publish (loud, obvious, fixable by setting the env var) than to
  // have this silently open to anyone who finds the URL.
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const scheduledPosts = await prisma.post.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: now },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
      },
    });

    if (scheduledPosts.length === 0) {
      return NextResponse.json({ message: "No posts to publish" });
    }

    // Update to published
    const publishedIds = scheduledPosts.map(p => p.id);
    await prisma.post.updateMany({
      where: { id: { in: publishedIds } },
      data: { status: "published" },
    });

    // Same "notify subscribers once the post is actually live" rule as
    // the immediate-publish path in POST /api/posts - a scheduled post
    // only becomes visible to anyone right now, at this exact tick, so
    // this is the one and only place it should fan out. Not awaited per
    // post: a batch of scheduled posts publishing together must not make
    // this cron run any slower than the DB update above already is.
    for (const scheduledPost of scheduledPosts) {
      void notifySubscribersOfNewPost({
        postId: scheduledPost.id,
        authorId: scheduledPost.author.id,
        authorName: scheduledPost.author.name || scheduledPost.author.username,
      });
    }

    return NextResponse.json({
      message: `Published ${scheduledPosts.length} scheduled posts.`,
      posts: scheduledPosts,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Failed to publish scheduled posts" }, { status: 500 });
  }
}
