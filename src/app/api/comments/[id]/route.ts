import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkPostLength } from "@/lib/limits";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

// ─── PREVENT STATIC GENERATION ─────────────────────────────────────
export const dynamic = 'force-dynamic';

// ─── UPDATE COMMENT ────────────────────────────────────────────────
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { content } = await req.json();
    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Comment content is required" },
        { status: 400 }
      );
    }

    // Check if comment exists and belongs to the user
    const comment = await prisma.comment.findUnique({
      where: { id: params.id },
      select: { authorId: true, author: { select: { plan: true } } },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.authorId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only edit your own comments" },
        { status: 403 }
      );
    }

    // Validate against the author's actual plan limit - previously this
    // had no server-side length check at all.
    const lengthCheck = checkPostLength(content.length, comment.author.plan);
    if (!lengthCheck.allowed) {
      return NextResponse.json({ error: lengthCheck.message }, { status: 400 });
    }

    const updated = await prisma.comment.update({
      where: { id: params.id },
      data: { content: content.trim() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating comment:", error);
    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// ─── DELETE COMMENT ────────────────────────────────────────────────
// Recursively collects imageUrl from a comment and every reply beneath
// it - replies cascade-delete along with their parent (onDelete: Cascade
// on the self-relation), at unlimited depth, so their images would be
// orphaned the exact same way the top comment's own image would be.
async function collectCommentImageUrls(commentId: string): Promise<string[]> {
  const replies = await prisma.comment.findMany({
    where: { parentId: commentId },
    select: { id: true, imageUrl: true },
  });
  const nested = await Promise.all(
    replies.map((r) => collectCommentImageUrls(r.id))
  );
  return [
    ...replies.map((r) => r.imageUrl).filter((u): u is string => !!u),
    ...nested.flat(),
  ];
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if comment exists and belongs to the user
    const comment = await prisma.comment.findUnique({
      where: { id: params.id },
      select: { authorId: true, imageUrl: true },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.authorId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only delete your own comments" },
        { status: 403 }
      );
    }

    const replyImageUrls = await collectCommentImageUrls(params.id);

    await prisma.comment.delete({
      where: { id: params.id },
    });

    await deleteUploadThingFiles([comment.imageUrl, ...replyImageUrls]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
