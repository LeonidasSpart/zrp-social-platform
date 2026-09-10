import type { NewsAutomationSetting, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SchedulerSettings } from "./scheduler";

/*
 * The single-row global control panel. Ships paused: deploying this
 * code must never, on its own, start publishing to the platform.
 */

export const SETTINGS_ID = "singleton";

export async function getAutomationSettings(
  db: PrismaClient = prisma
): Promise<NewsAutomationSetting> {
  const existing = await db.newsAutomationSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;

  // upsert rather than create: two concurrent first-ever cycles must
  // not race each other into a unique-constraint failure.
  return db.newsAutomationSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export function toSchedulerSettings(settings: NewsAutomationSetting): SchedulerSettings {
  return {
    maxPublicationsPerCycle: settings.maxPublicationsPerCycle,
    maxPublicationsPerDay: settings.maxPublicationsPerDay,
    minMinutesBetweenPublications: settings.minMinutesBetweenPublications,
    requireHumanReviewForSensitive: settings.requireHumanReviewForSensitive,
    enabledLanguages: settings.enabledLanguages,
    enabledTopics: settings.enabledTopics,
    enabledRegions: settings.enabledRegions,
    enabledCountries: settings.enabledCountries,
  };
}

/**
 * How long a cycle's publications are spread over, in minutes.
 *
 * This must track the interval the cron actually runs at, because the
 * planner derives its spacing from it:
 *
 *   spacing = max(minMinutesBetweenPublications, window / maxSlots)
 *
 * At the old 150 - sized for a cycle every 2-3 hours - a full plan of
 * 24 slots was spread over 2h18m, so the categories at the bottom of
 * the plan could not get an article inside the hour no matter how much
 * genuine news existed for them. At 60 the whole plan lands within the
 * hour it belongs to.
 *
 * Anything still scheduled when the next cycle starts is not lost: the
 * cycle publishes everything due before it plans anything new.
 */
export const CYCLE_WINDOW_MINUTES = 60;

export function nextCycleAt(from: Date): Date {
  return new Date(from.getTime() + CYCLE_WINDOW_MINUTES * 60 * 1000);
}
