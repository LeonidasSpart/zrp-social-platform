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

/** How long a cycle's publications are spread over, in minutes. */
export const CYCLE_WINDOW_MINUTES = 150;

export function nextCycleAt(from: Date): Date {
  return new Date(from.getTime() + CYCLE_WINDOW_MINUTES * 60 * 1000);
}
