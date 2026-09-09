import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { UTApi } from "uploadthing/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Uploads an editorial feed's avatar/cover through admin, the only way
 * to change either: these accounts are deliberately created with no
 * password (see feeds.ts) so they can never be signed into and use the
 * normal self-service /api/user/update-avatar or /update-cover routes,
 * which both require a session. Same validation and UTApi upload as
 * those routes - just admin-gated and audited instead of session-gated.
 */
async function handleImageUpload(
  request: NextRequest,
  feedId: string,
  adminCheck: { session: Session }
): Promise<NextResponse> {
  const feed = await prisma.newsFeed.findUnique({ where: { id: feedId }, select: { key: true, userId: true } });
  if (!feed) {
    return NextResponse.json({ success: false, error: "Feed not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const avatarFile = formData.get("avatarFile") as File | null;
  const coverFile = formData.get("coverFile") as File | null;
  const file = avatarFile ?? coverFile;
  const field = avatarFile ? "avatarUrl" : "coverUrl";

  if (!file) {
    return NextResponse.json({ success: false, error: "No avatarFile or coverFile provided" }, { status: 400 });
  }

  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ success: false, error: "File too large. Max size is 5MB." }, { status: 400 });
  }

  const utapi = new UTApi();
  const uploadResult = await utapi.uploadFiles(file);

  if (uploadResult.error) {
    console.error("ZRP News admin feed image upload error:", uploadResult.error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }

  const url = uploadResult.data.ufsUrl;

  const user = await prisma.user.update({
    where: { id: feed.userId },
    data: { [field]: url },
    select: { avatarUrl: true, coverUrl: true },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: field === "avatarUrl" ? "news_network.feed_avatar_update" : "news_network.feed_cover_update",
    targetType: "NewsFeed",
    targetId: feedId,
    metadata: { key: feed.key, [field]: url },
  });

  return NextResponse.json({ success: true, user });
}

/**
 * PATCH /api/admin/news-network/feeds/[id]
 *
 * Enable/disable a feed, tune its cadence, or (multipart/form-data
 * body) upload its avatar/cover. Full admin only, audited. The
 * per-feed limits are bounded here as well as in the scheduler: "post
 * every minute" must not be reachable through the UI.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      return handleImageUpload(request, id, adminCheck);
    }

    const body = await request.json();

    const data: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    if (body.minMinutesBetweenPosts !== undefined) {
      const value = Number(body.minMinutesBetweenPosts);
      if (!Number.isInteger(value) || value < 30 || value > 1440) {
        return NextResponse.json(
          { success: false, error: "minMinutesBetweenPosts must be between 30 and 1440" },
          { status: 400 }
        );
      }
      data.minMinutesBetweenPosts = value;
    }

    if (body.maxPostsPerDay !== undefined) {
      const value = Number(body.maxPostsPerDay);
      if (!Number.isInteger(value) || value < 0 || value > 24) {
        return NextResponse.json(
          { success: false, error: "maxPostsPerDay must be between 0 and 24" },
          { status: 400 }
        );
      }
      data.maxPostsPerDay = value;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const feed = await prisma.newsFeed.update({ where: { id }, data });

    await logAdminAction({
      actor: adminCheck.session,
      action: data.enabled === undefined ? "news_network.feed_update" : data.enabled ? "news_network.feed_enable" : "news_network.feed_disable",
      targetType: "NewsFeed",
      targetId: id,
      metadata: { key: feed.key, ...data },
    });

    return NextResponse.json({ success: true, feed });
  } catch (error) {
    console.error("ZRP News admin feed update error:", error);
    return NextResponse.json({ success: false, error: "Failed to update feed" }, { status: 500 });
  }
}
