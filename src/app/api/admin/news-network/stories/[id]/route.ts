import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import {
  applyCorrection,
  publishDuePublication,
  reservePublication,
} from "@/lib/news/publish";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/news-network/stories/[id] */
export async function GET(_request: NextRequest, context: RouteContext) {
  const staffCheck = await requireStaff();
  if (!staffCheck.authorized) return staffCheck.response;

  const { id } = await context.params;

  const story = await prisma.newsStory.findUnique({
    where: { id },
    include: {
      references: { include: { source: true } },
      renditions: true,
      publications: { include: { feed: { select: { key: true, displayName: true } } } },
    },
  });

  if (!story) {
    return NextResponse.json({ success: false, error: "Story not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, story });
}

/**
 * PATCH /api/admin/news-network/stories/[id]
 *
 * Editorial actions on one story:
 *
 *   { action: "reject", reason }              take it out of the queue
 *   { action: "correct", note }               publish a visible correction
 *   { action: "publish", language, feedId }   publish it manually now
 *
 * "correct" appends a clearly labelled correction to every live post
 * for the story rather than silently rewriting them - a reader who saw
 * the original must be able to see that it changed.
 *
 * "publish" is the human-review path for a sensitive story: an admin
 * who has read the sources and the generated summary can send it out.
 * It still goes through the same idempotency key as automated
 * publication, so it cannot double-post.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body.action ?? "");

    const story = await prisma.newsStory.findUnique({
      where: { id },
      select: { id: true, status: true, title: true },
    });

    if (!story) {
      return NextResponse.json({ success: false, error: "Story not found" }, { status: 404 });
    }

    if (action === "reject") {
      const reason = String(body.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json(
          { success: false, error: "A reason is required to reject a story" },
          { status: 400 }
        );
      }

      await prisma.newsStory.update({
        where: { id },
        data: { status: "REJECTED", rejectionReason: reason.slice(0, 1000) },
      });

      await logAdminAction({
        actor: adminCheck.session,
        action: "news_network.story_reject",
        targetType: "NewsStory",
        targetId: id,
        metadata: { title: story.title, reason },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "correct") {
      const note = String(body.note ?? "").trim();
      if (!note) {
        return NextResponse.json(
          { success: false, error: "A correction note is required" },
          { status: 400 }
        );
      }

      const updated = await applyCorrection(
        prisma,
        id,
        note.slice(0, 500),
        new Date()
      );

      await logAdminAction({
        actor: adminCheck.session,
        action: "news_network.story_correct",
        targetType: "NewsStory",
        targetId: id,
        metadata: { title: story.title, note, postsUpdated: updated },
      });

      return NextResponse.json({ success: true, postsUpdated: updated });
    }

    if (action === "publish") {
      const language = String(body.language ?? "").trim();
      const feedId = String(body.feedId ?? "").trim();

      if (!language || !feedId) {
        return NextResponse.json(
          { success: false, error: "language and feedId are required" },
          { status: 400 }
        );
      }

      const rendition = await prisma.newsRendition.findUnique({
        where: { storyId_language: { storyId: id, language } },
        select: { id: true, status: true },
      });

      if (!rendition || rendition.status !== "READY") {
        return NextResponse.json(
          { success: false, error: "There is no validated summary in that language" },
          { status: 400 }
        );
      }

      const feed = await prisma.newsFeed.findUnique({
        where: { id: feedId },
        select: { id: true, enabled: true, language: true },
      });

      if (!feed || !feed.enabled) {
        return NextResponse.json(
          { success: false, error: "Feed not found or disabled" },
          { status: 400 }
        );
      }

      if (feed.language !== language) {
        return NextResponse.json(
          { success: false, error: "That feed does not publish in that language" },
          { status: 400 }
        );
      }

      const now = new Date();

      const reserved = await reservePublication(prisma, {
        storyId: id,
        renditionId: rendition.id,
        feedId,
        language,
        scheduledFor: now,
        isBreaking: false,
      });

      if (!reserved) {
        return NextResponse.json(
          { success: false, error: "This story has already been published in that language" },
          { status: 409 }
        );
      }

      const outcome = await publishDuePublication(prisma, reserved.id, now);

      await logAdminAction({
        actor: adminCheck.session,
        action: "news_network.story_publish_manual",
        targetType: "NewsStory",
        targetId: id,
        metadata: { title: story.title, language, feedId, outcome: outcome.status },
      });

      return NextResponse.json({ success: outcome.status === "published", outcome });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("ZRP News admin story action error:", error);
    return NextResponse.json({ success: false, error: "Failed to update story" }, { status: 500 });
  }
}
