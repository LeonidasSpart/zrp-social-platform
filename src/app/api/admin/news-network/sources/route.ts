import { NextRequest, NextResponse } from "next/server";
import type { NewsRegion, NewsTopic } from "@prisma/client";
import { NewsRegion as Regions, NewsTopic as Topics } from "@prisma/client";
import { requireStaff, requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { validateUrl } from "@/lib/ssrf-guard";

export const dynamic = "force-dynamic";

/** GET /api/admin/news-network/sources */
export async function GET() {
  const staffCheck = await requireStaff();
  if (!staffCheck.authorized) return staffCheck.response;

  try {
    const sources = await prisma.newsSource.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { _count: { select: { references: true } } },
    });

    return NextResponse.json(
      { success: true, sources },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ZRP News admin sources error:", error);
    return NextResponse.json({ success: false, error: "Failed to load sources" }, { status: 500 });
  }
}

/**
 * POST /api/admin/news-network/sources
 *
 * Adds one source. The feed URL goes through the same SSRF validation
 * as every other server-side fetch of a submitted URL, so an admin
 * cannot (accidentally or otherwise) point the ingester at an internal
 * service or a cloud metadata endpoint.
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const body = await request.json();

    const key = String(body.key ?? "").trim();
    const name = String(body.name ?? "").trim();
    const publisher = String(body.publisher ?? "").trim();
    const feedUrl = String(body.feedUrl ?? "").trim();

    if (!key || !name || !publisher || !feedUrl) {
      return NextResponse.json(
        { success: false, error: "key, name, publisher and feedUrl are required" },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9-]{2,64}$/.test(key)) {
      return NextResponse.json(
        { success: false, error: "key must be 2-64 lowercase letters, digits or hyphens" },
        { status: 400 }
      );
    }

    try {
      validateUrl(feedUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "feedUrl must be a valid http(s) URL" },
        { status: 400 }
      );
    }

    const region = String(body.region ?? "GLOBAL").toUpperCase();
    if (!(Object.values(Regions) as string[]).includes(region)) {
      return NextResponse.json({ success: false, error: "Invalid region" }, { status: 400 });
    }

    const topics = Array.isArray(body.topics)
      ? body.topics.map((topic: unknown) => String(topic).toUpperCase())
      : [];
    if (topics.some((topic: string) => !(Object.values(Topics) as string[]).includes(topic))) {
      return NextResponse.json({ success: false, error: "Invalid topic" }, { status: 400 });
    }

    const trustTier = Number(body.trustTier ?? 2);
    if (![1, 2, 3].includes(trustTier)) {
      return NextResponse.json(
        { success: false, error: "trustTier must be 1, 2 or 3" },
        { status: 400 }
      );
    }

    const source = await prisma.newsSource.create({
      data: {
        key,
        name,
        publisher,
        feedUrl,
        homepageUrl: body.homepageUrl ? String(body.homepageUrl) : null,
        region: region as NewsRegion,
        country: body.country ? String(body.country).toUpperCase().slice(0, 2) : null,
        language: String(body.language ?? "en").slice(0, 8),
        topics: topics as NewsTopic[],
        trustTier,
        official: Boolean(body.official),
        // Never defaulted on from an API call: reusing a publisher's
        // images is a licensing decision someone has to make explicitly.
        allowImages: Boolean(body.allowImages),
        attribution: body.attribution ? String(body.attribution) : null,
        fetchIntervalMinutes: Math.min(
          1440,
          Math.max(15, Number(body.fetchIntervalMinutes ?? 60) || 60)
        ),
        enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      },
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.source_create",
      targetType: "NewsSource",
      targetId: source.id,
      metadata: { key, feedUrl, trustTier },
    });

    return NextResponse.json({ success: true, source }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, error: "A source with that key or feed URL already exists" },
        { status: 409 }
      );
    }
    console.error("ZRP News admin source create error:", error);
    return NextResponse.json({ success: false, error: "Failed to create source" }, { status: 500 });
  }
}
