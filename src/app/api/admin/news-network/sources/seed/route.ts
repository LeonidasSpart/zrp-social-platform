import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { SEED_SOURCES } from "@/lib/news/sources-seed";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/news-network/sources/seed
 *
 * Installs the curated starter source registry. Idempotent: a source
 * that already exists is left exactly as it is, including any
 * enable/disable or trust-tier change an admin has made since.
 *
 * Seeding creates no content. Verify each source afterwards
 * (POST .../sources/[id]/verify) before relying on it.
 */
export async function POST() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const created: string[] = [];
    const existing: string[] = [];

    for (const seed of SEED_SOURCES) {
      const found = await prisma.newsSource.findFirst({
        where: { OR: [{ key: seed.key }, { feedUrl: seed.feedUrl }] },
        select: { id: true },
      });

      if (found) {
        existing.push(seed.key);
        continue;
      }

      await prisma.newsSource.create({
        data: {
          key: seed.key,
          name: seed.name,
          publisher: seed.publisher,
          feedUrl: seed.feedUrl,
          homepageUrl: seed.homepageUrl ?? null,
          region: seed.region,
          country: seed.country ?? null,
          language: seed.language,
          topics: seed.topics,
          trustTier: seed.trustTier,
          official: seed.official ?? false,
          attribution: seed.attribution ?? null,
          fetchIntervalMinutes: seed.fetchIntervalMinutes ?? 60,
          // Image reuse stays off until someone reads the publisher's
          // terms and turns it on for that specific source.
          allowImages: false,
          enabled: true,
        },
      });

      created.push(seed.key);
    }

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.sources_seed",
      targetType: "NewsSource",
      metadata: { created: created.length, existing: existing.length },
    });

    return NextResponse.json({
      success: true,
      created,
      existing,
      note: "Run the verify action on each source before enabling the automation.",
    });
  } catch (error) {
    console.error("ZRP News admin source seed error:", error);
    return NextResponse.json({ success: false, error: "Failed to seed sources" }, { status: 500 });
  }
}
