import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ─── GET: Check if user has reposted ────────────────────────────────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    const repost = await prisma.repost.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });
    return NextResponse.json({ reposted: !!repost });
  } catch {
    return NextResponse.json({ error: "Failed to check repost" }, { status: 500 });
  }
}

// ─── POST: Toggle repost / unrepost ─────────────────────────────────
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 60 repost-toggles per minute - blocks repost-bombing scripts.
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "post-repost" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    // Check if already reposted
    const existing = await prisma.repost.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existing) {
      // Unrepost
      await prisma.repost.delete({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });
      return NextResponse.json({ reposted: false });
    } else {
      // Repost
      await prisma.repost.create({
        data: {
          postId,
          userId,
        },
      });
      return NextResponse.json({ reposted: true });
    }
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
