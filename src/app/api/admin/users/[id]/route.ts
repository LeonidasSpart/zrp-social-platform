import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { invalidateUserAuthState } from "@/lib/auth-state";
import { Prisma, Role } from "@prisma/client";
import { deleteUserAccountAndFiles } from "@/lib/account-deletion";
import { logAdminAction } from "@/lib/audit-log";

const VALID_BADGE_TYPES = ["verified", "organization", "government", "team", "journalist", null];
// JOURNALIST is deliberately NOT settable here. It's only ever granted
// via /api/admin/journalists/[id] (approve/restore), which sets the
// role AND creates/updates the matching JournalistProfile AND syncs the
// badge together in one transaction. Allowing it through this generic
// endpoint would let an admin set role="JOURNALIST" with no
// JournalistProfile row behind it - requireJournalistRole() checks for
// both, so that user would show as a journalist everywhere but get a
// 403 on every journalist API call.
const VALID_ROLES = ["USER", "MODERATOR", "ADMIN"];

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { isAdmin, badgeType, role } = await req.json();

    const data: { isAdmin?: boolean; badgeType?: string | null; role?: Role } = {};

    if (isAdmin !== undefined) {
      if (typeof isAdmin !== "boolean") {
        return NextResponse.json({ error: "isAdmin must be a boolean" }, { status: 400 });
      }
      data.isAdmin = isAdmin;
    }
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

    // Role/isAdmin changed: make it take effect on this instance now,
    // not at the end of the auth-state cache window.
    invalidateUserAuthState(params.id);

    await logAdminAction({
      actor: adminCheck.session,
      action: "user.update_permissions",
      targetType: "User",
      targetId: params.id,
      metadata: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    // ⚠️ SECURITY: uses the exact same account-wipe helper as
    // self-service deletion (src/lib/account-deletion.ts) instead of a
    // second, independently-maintained collection of "every model that
    // can own an upload." This route used to reimplement that list
    // itself and only covered avatar/cover/posts/comments/sent-messages/
    // stories - silently missing music tracks/albums/artist/playlists,
    // marketplace listings, HELP campaign images/proof, opportunity
    // application resumes, and messages the deleted user had RECEIVED
    // (each leaking that user's files in UploadThing forever once the
    // owning DB rows were gone, since nothing referenced them to find
    // them again). A single source of truth for "what does a user's
    // account cascade delete" means a new model gaining an upload only
    // needs updating once, here.
    if (!(await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } }))) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await deleteUserAccountAndFiles(params.id);

    await logAdminAction({
      actor: adminCheck.session,
      action: "user.delete",
      targetType: "User",
      targetId: params.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
