import { NextRequest, NextResponse } from "next/server";
import type { NewsRegion, NewsTopic } from "@prisma/client";
import { NewsRegion as Regions, NewsTopic as Topics } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { getAutomationSettings, SETTINGS_ID } from "@/lib/news/settings";
import { isNewsLanguage } from "@/lib/news/config";

export const dynamic = "force-dynamic";

/** GET /api/admin/news-network/settings */
export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const settings = await getAutomationSettings();
  return NextResponse.json({ success: true, settings });
}

function parseEnumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => String(entry).toUpperCase());
  if (normalized.some((entry) => !(allowed as readonly string[]).includes(entry))) return null;
  return normalized as T[];
}

function parseBoundedInt(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * PATCH /api/admin/news-network/settings
 *
 * Full-admin only, and audited. Pausing is the platform's kill switch:
 * it takes effect on the very next cycle, and any publication already
 * scheduled stops being published while paused.
 *
 * Every numeric limit is bounded server-side. An admin cannot set
 * "publish 10,000 posts per cycle" through this endpoint, by typo or
 * otherwise.
 */
export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (typeof body.paused === "boolean") data.paused = body.paused;

    if (typeof body.requireHumanReviewForSensitive === "boolean") {
      data.requireHumanReviewForSensitive = body.requireHumanReviewForSensitive;
    }

    if (body.enabledLanguages !== undefined) {
      if (!Array.isArray(body.enabledLanguages)) {
        return NextResponse.json(
          { success: false, error: "enabledLanguages must be an array" },
          { status: 400 }
        );
      }
      const languages = body.enabledLanguages.map((entry: unknown) => String(entry));
      if (languages.some((language: string) => !isNewsLanguage(language))) {
        return NextResponse.json(
          { success: false, error: "Supported news languages are: en, fr, de, it" },
          { status: 400 }
        );
      }
      data.enabledLanguages = languages;
    }

    if (body.enabledTopics !== undefined) {
      const topics = parseEnumArray<NewsTopic>(
        body.enabledTopics,
        Object.values(Topics) as NewsTopic[]
      );
      if (!topics) {
        return NextResponse.json({ success: false, error: "Invalid topic" }, { status: 400 });
      }
      data.enabledTopics = topics;
    }

    if (body.enabledRegions !== undefined) {
      const regions = parseEnumArray<NewsRegion>(
        body.enabledRegions,
        Object.values(Regions) as NewsRegion[]
      );
      if (!regions) {
        return NextResponse.json({ success: false, error: "Invalid region" }, { status: 400 });
      }
      data.enabledRegions = regions;
    }

    if (body.enabledCountries !== undefined) {
      if (
        !Array.isArray(body.enabledCountries) ||
        body.enabledCountries.some((entry: unknown) => !/^[A-Za-z]{2}$/.test(String(entry)))
      ) {
        return NextResponse.json(
          { success: false, error: "enabledCountries must be ISO-3166 alpha-2 codes" },
          { status: 400 }
        );
      }
      data.enabledCountries = body.enabledCountries.map((entry: unknown) =>
        String(entry).toUpperCase()
      );
    }

    const numericFields: Array<[string, number, number]> = [
      ["maxPublicationsPerCycle", 0, 60],
      ["maxPublicationsPerDay", 0, 400],
      ["minMinutesBetweenPublications", 1, 720],
    ];

    for (const [field, min, max] of numericFields) {
      if (body[field] === undefined) continue;
      const parsed = parseBoundedInt(body[field], min, max);
      if (parsed === null) {
        return NextResponse.json(
          { success: false, error: `${field} must be an integer between ${min} and ${max}` },
          { status: 400 }
        );
      }
      data[field] = parsed;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    await getAutomationSettings();

    const settings = await prisma.newsAutomationSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.settings_update",
      targetType: "NewsAutomationSetting",
      targetId: SETTINGS_ID,
      metadata: data,
    });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("ZRP News admin settings error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
