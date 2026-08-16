import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { deleteUploadThingFiles } from "@/lib/uploadthing";

const VALID_BADGE_TYPES = ["verified", "organization", "government", "team", null];
const VALID_ROLES = ["USER", "MODERATOR", "ADMIN"];

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { isAdmin, badgeType, role } = await req.json();

    const data: { isAdmin?: boolean; badgeType?: string | null; role?: Role } = {};

    if (isAdmin !== undefined) data.isAdmin = isAdmin;
    if (badgeType !== undefined) {
      if (!VALID_BADGE_TYPES.includes(badgeType)) {
        return NextResponse.json({ error: "Invalid badge type" }, { status: 400 });
      }
      data.badgeType = badgeType;
    }
    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      data.role = role as Role; // ✅ cast to Role enum
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        isAdmin: true,
        badgeType: true,
        _count: {
          select: { posts: true, comments: true, reports: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    // Same full-account UploadThing cleanup as self-service account
    // deletion (see src/app/api/user/delete/confirm/route.ts) - this is
    // a separate code path admins/moderators use, with the identical gap.
    const [user, posts, comments, messages, stories] = await Promise.all([
      prisma.user.findUnique({
        where: { id: params.id },
        select: { avatarUrl: true, coverUrl: true },
      }),
      prisma.post.findMany({
        where: { authorId: params.id },
        select: { imageUrl: true, imageUrls: true },
      }),
      prisma.comment.findMany({
        where: { authorId: params.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.message.findMany({
        where: { senderId: params.id, imageUrl: { not: null } },
        select: { imageUrl: true },
      }),
      prisma.story.findMany({
        where: { userId: params.id, mediaUrl: { not: null } },
        select: { mediaUrl: true },
      }),
    ]);

    await prisma.user.delete({
      where: { id: params.id },
    });

    await deleteUploadThingFiles([
      user?.avatarUrl,
      user?.coverUrl,
      ...posts.flatMap((p) => [p.imageUrl, ...p.imageUrls]),
      ...comments.map((c) => c.imageUrl),
      ...messages.map((m) => m.imageUrl),
      ...stories.map((s) => s.mediaUrl),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
