import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - this is core content-moderation work.
// Sensitive/financial admin routes (roles, plan changes, payments, analytics)
// stay on requireAdmin.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    // Same UploadThing-orphan gap as the user-facing delete route - a
    // moderator removing a post (or its comments, cascade-deleted with
    // it) never cleaned up the underlying files either.
    const post = await prisma.post.findUnique({
      where: { id: params.id },
      select: { imageUrl: true, imageUrls: true },
    });
    const commentsWithImages = await prisma.comment.findMany({
      where: { postId: params.id, imageUrl: { not: null } },
      select: { imageUrl: true },
    });

    await prisma.post.delete({
      where: { id: params.id },
    });

    await deleteUploadThingFiles([
      post?.imageUrl,
      ...(post?.imageUrls || []),
      ...commentsWithImages.map((c) => c.imageUrl),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
