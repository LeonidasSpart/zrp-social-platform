import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { fetchSource } from "@/lib/news/ingest";
import { isFeedUrlAllowed } from "@/lib/news/robots";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/news-network/sources/[id]/verify
 *
 * Performs one live fetch and parse of a source and reports what came
 * back. Nothing is ingested, no story is created and nothing is
 * published - this is the "does this feed actually work?" check to run
 * before enabling a source, and the way to confirm the seeded feed URLs
 * are still correct.
 *
 * It deliberately does not touch the source's health fields either, so
 * a verification attempt cannot reset a real backoff.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;

    const source = await prisma.newsSource.findUnique({
      where: { id },
      select: { id: true, key: true, feedUrl: true, name: true },
    });

    if (!source) {
      return NextResponse.json({ success: false, error: "Source not found" }, { status: 404 });
    }

    const robotsAllowed = await isFeedUrlAllowed(source.feedUrl);

    // Pass no ETag/Last-Modified so verification always sees the real
    // body rather than a 304.
    const outcome = await fetchSource({
      feedUrl: source.feedUrl,
      etag: null,
      lastModified: null,
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.source_verify",
      targetType: "NewsSource",
      targetId: id,
      metadata: { key: source.key, ok: outcome.ok, items: outcome.items.length },
    });

    return NextResponse.json({
      success: true,
      source: { id: source.id, key: source.key, name: source.name, feedUrl: source.feedUrl },
      robotsAllowed,
      ok: outcome.ok,
      error: outcome.error,
      itemCount: outcome.items.length,
      // A small sample so an admin can eyeball that the parser read the
      // feed correctly before trusting it.
      sample: outcome.items.slice(0, 3).map((item) => ({
        title: item.title,
        link: item.link,
        publishedAt: item.publishedAt,
        hasSummary: Boolean(item.summary),
        hasImage: Boolean(item.imageUrl),
      })),
    });
  } catch (error) {
    console.error("ZRP News admin source verify error:", error);
    return NextResponse.json({ success: false, error: "Failed to verify source" }, { status: 500 });
  }
}
