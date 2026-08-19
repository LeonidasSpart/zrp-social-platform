// src/app/api/posts/[id]/pin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;

  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.authorId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pinnedPostId: true },
    });

    const isPinned = user?.pinnedPostId === postId;

    if (isPinned) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { pinnedPostId: null },
      });
      return NextResponse.json({ pinned: false });
    } else {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { pinnedPostId: postId },
      });
      return NextResponse.json({ pinned: true });
    }
  } catch (error) {
    console.error("Pin toggle error:", error);
    return NextResponse.json(
      { error: "Failed to toggle pin" },
      { status: 500 }
    );
  }
}
