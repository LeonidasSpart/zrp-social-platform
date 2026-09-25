import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { findVisiblePost } from "@/lib/post-visibility";

// An emoji - including ZWJ family/flag sequences - is a handful of
// UTF-16 code units; anything longer is not an emoji.
const MAX_EMOJI_LENGTH = 32;

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

// ─── POST /api/posts/[id]/reaction: Toggle reaction ──────────────
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "post-reaction" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Was `if (!emoji)` only: any JSON value (an object -> Prisma 500, or
  // an arbitrarily long string stored and served back to every viewer
  // of the post) was accepted as an "emoji".
  const { emoji } = await req.json().catch(() => ({}));
  if (typeof emoji !== "string" || !emoji.trim() || emoji.length > MAX_EMOJI_LENGTH) {
    return NextResponse.json({ error: "Emoji required" }, { status: 400 });
  }

  try {
    const existing = await prisma.reaction.findFirst({
      where: {
        postId: params.id,
        userId: session.user.id,
        emoji,
      },
    });

    // Removing your own reaction is always allowed - even after losing
    // visibility of the post (unfollowed a private account, a block) -
    // so nobody is stuck with a reaction they can no longer take back.
    if (existing) {
      try {
        await prisma.reaction.delete({ where: { id: existing.id } });
      } catch (err) {
        if (!isPrismaCode(err, "P2025")) throw err;
      }
      return NextResponse.json({ reaction: null });
    }

    // Same visibility + block rules as liking the post - this route had
    // neither, so a blocked user (or a non-follower of a private
    // account) could still react.
    const post = await findVisiblePost(session.user.id, params.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (post.authorId !== session.user.id && (await isBlockedEitherWay(session.user.id, post.authorId))) {
      return NextResponse.json({ error: "Unable to react to this post" }, { status: 403 });
    }

    try {
      const reaction = await prisma.reaction.create({
        data: {
          postId: params.id,
          userId: session.user.id,
          emoji,
        },
      });
      return NextResponse.json({ reaction });
    } catch (err) {
      // A concurrent identical request already created it.
      if (!isPrismaCode(err, "P2002")) throw err;
      const reaction = await prisma.reaction.findFirst({
        where: { postId: params.id, userId: session.user.id, emoji },
      });
      return NextResponse.json({ reaction });
    }
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Failed to toggle reaction" }, { status: 500 });
  }
}

// ─── GET /api/posts/[id]/reaction: Get all reactions ──────────────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const reactions = await prisma.reaction.findMany({
    where: { postId: params.id },
    include: {
      user: {
        select: { id: true, username: true, name: true, avatarUrl: true },
      },
    },
  });
  return NextResponse.json(reactions);
}
