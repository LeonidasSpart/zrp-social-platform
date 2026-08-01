import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const postId = params.id;

    // Check if post exists and belongs to user
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.authorId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only pin your own posts" },
        { status: 403 }
      );
    }

    // Check if this post is already pinned
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pinnedPostId: true },
    });

    const isPinned = user?.pinnedPostId === postId;

    if (isPinned) {
      // Unpin
      await prisma.user.update({
        where: { id: session.user.id },
        data: { pinnedPostId: null },
      });
      return NextResponse.json({ pinned: false });
    } else {
      // Pin (overwrites any existing pinned post)
      await prisma.user.update({
        where: { id: session.user.id },
        data: { pinnedPostId: postId },
      });
      return NextResponse.json({ pinned: true });
    }
  } catch (error) {
    console.error("Error toggling pin:", error);
    return NextResponse.json(
      { error: "Failed to toggle pin" },
      { status: 500 }
    );
  }
}
