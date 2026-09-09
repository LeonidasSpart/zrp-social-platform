import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { removePublication } from "@/lib/news/publish";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/news-network/publications/[id]
 *
 * Takes an automated post down: deletes the post and marks the
 * publication REMOVED with the reason, which stays on the record.
 *
 * Because the idempotency key is (story, language), a removed
 * publication is not silently re-created by the next cycle - getting it
 * back out is a deliberate manual publish.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason ?? "").trim() || "Removed by an administrator";

    const publication = await prisma.newsPublication.findUnique({
      where: { id },
      select: { id: true, storyId: true, language: true, postId: true },
    });

    if (!publication) {
      return NextResponse.json({ success: false, error: "Publication not found" }, { status: 404 });
    }

    await removePublication(prisma, id, reason, new Date());

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.publication_remove",
      targetType: "NewsPublication",
      targetId: id,
      metadata: {
        storyId: publication.storyId,
        language: publication.language,
        postId: publication.postId,
        reason,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ZRP News admin publication remove error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove publication" },
      { status: 500 }
    );
  }
}
