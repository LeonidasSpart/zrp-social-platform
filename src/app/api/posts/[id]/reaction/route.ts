import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ─── POST /api/posts/[id]/reaction – Toggle reaction ──────────────
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { emoji } = await req.json();
  if (!emoji) {
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

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ reaction: null });
    } else {
      const reaction = await prisma.reaction.create({
        data: {
          postId: params.id,
          userId: session.user.id,
          emoji,
        },
      });
      return NextResponse.json({ reaction });
    }
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Failed to toggle reaction" }, { status: 500 });
  }
}

// ─── GET /api/posts/[id]/reaction – Get all reactions ──────────────
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
