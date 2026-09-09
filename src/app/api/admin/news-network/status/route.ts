import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getAutomationSettings } from "@/lib/news/settings";
import { startOfUtcDay } from "@/lib/news/pipeline";
import { TRAVEL_TOPICS } from "@/lib/news/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/news-network/status
 *
 * Everything the admin dashboard shows. Every figure here is a live
 * count from the database - there is no estimated, cached or
 * placeholder number in this response.
 */
export async function GET() {
  const staffCheck = await requireStaff();
  if (!staffCheck.authorized) return staffCheck.response;

  try {
    const now = new Date();
    const dayStart = startOfUtcDay(now);

    const settings = await getAutomationSettings();

    const [
      lastRun,
      feedsTotal,
      feedsEnabled,
      publicationsToday,
      travelToday,
      languageRows,
      countryRows,
      topicRows,
      failedPublications,
      failedRenditions,
      duplicatesPreventedToday,
      sourceRows,
      pendingSensitive,
      readyStories,
      scheduledPublications,
    ] = await Promise.all([
      prisma.newsJobRun.findFirst({ orderBy: { startedAt: "desc" } }),
      prisma.newsFeed.count(),
      prisma.newsFeed.count({ where: { enabled: true } }),
      prisma.newsPublication.count({
        where: { status: "PUBLISHED", publishedAt: { gte: dayStart } },
      }),
      prisma.newsPublication.count({
        where: {
          status: "PUBLISHED",
          publishedAt: { gte: dayStart },
          story: { topic: { in: TRAVEL_TOPICS } },
        },
      }),
      prisma.newsPublication.groupBy({
        by: ["language"],
        where: { status: "PUBLISHED", publishedAt: { gte: dayStart } },
        _count: { _all: true },
      }),
      prisma.newsStory.groupBy({
        by: ["country"],
        where: { status: "PUBLISHED", publishedAt: { gte: dayStart } },
        _count: { _all: true },
      }),
      prisma.newsStory.groupBy({
        by: ["topic"],
        where: { status: "PUBLISHED", publishedAt: { gte: dayStart } },
        _count: { _all: true },
      }),
      prisma.newsPublication.count({ where: { status: "FAILED" } }),
      prisma.newsRendition.count({
        where: { status: "FAILED", updatedAt: { gte: dayStart } },
      }),
      prisma.newsJobRun.aggregate({
        where: { startedAt: { gte: dayStart } },
        _sum: { duplicatesPrevented: true },
      }),
      prisma.newsSource.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.newsStory.count({
        where: { sensitive: true, status: { in: ["NEW", "READY"] } },
      }),
      prisma.newsStory.count({ where: { status: "READY" } }),
      prisma.newsPublication.count({ where: { status: "SCHEDULED" } }),
    ]);

    const sourceHealth = { HEALTHY: 0, WARNING: 0, FAILED: 0, DISABLED: 0 };
    sourceRows.forEach((row) => {
      sourceHealth[row.status] = row._count._all;
    });

    return NextResponse.json(
      {
        success: true,
        status: {
          paused: settings.paused,
          lastCycleAt: settings.lastCycleAt,
          nextCycleAt: settings.nextCycleAt,
          requireHumanReviewForSensitive: settings.requireHumanReviewForSensitive,
          enabledLanguages: settings.enabledLanguages,
          maxPublicationsPerCycle: settings.maxPublicationsPerCycle,
          maxPublicationsPerDay: settings.maxPublicationsPerDay,
          minMinutesBetweenPublications: settings.minMinutesBetweenPublications,
        },
        lastRun,
        feeds: { total: feedsTotal, enabled: feedsEnabled },
        publications: {
          today: publicationsToday,
          travelToday,
          scheduled: scheduledPublications,
          failed: failedPublications,
        },
        stories: { ready: readyStories, pendingSensitiveReview: pendingSensitive },
        renditions: { failedToday: failedRenditions },
        duplicatesPreventedToday: duplicatesPreventedToday._sum.duplicatesPrevented ?? 0,
        distribution: {
          languages: languageRows.map((row) => ({
            language: row.language,
            count: row._count._all,
          })),
          countries: countryRows.map((row) => ({
            country: row.country,
            count: row._count._all,
          })),
          topics: topicRows.map((row) => ({ topic: row.topic, count: row._count._all })),
        },
        sourceHealth,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ZRP News admin status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load news network status" },
      { status: 500 }
    );
  }
}
