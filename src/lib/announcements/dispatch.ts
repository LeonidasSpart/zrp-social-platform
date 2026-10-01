import crypto from "crypto";
import type { Announcement, AnnouncementStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";
import { sendPushNotification } from "@/lib/push-notifications";
import { getAnnouncementSystemUserId } from "./system-user";
import { getEligibleUserIdBatch, countEligibleRecipients } from "./eligibility";
import { truncateForPush } from "./types";

// How many eligible users one Notification.createMany()/push-dispatch
// round goes through at a time. Bounded so a single batch is cheap
// regardless of total audience size - "SEND TO ALL" at 1M users is
// ~5,000 of these, never one query/loop over 1M rows.
export const BATCH_SIZE = 200;

// How many of a batch's push sends run concurrently. sendPushNotification
// already fans out to 3 providers and every device a user owns - firing
// a whole 200-user batch at once would mean thousands of simultaneous
// outbound provider calls and DB lookups per batch. This caps it to a
// small worker pool instead.
const PUSH_CONCURRENCY = 20;

// How many batches one processBroadcastBatches() call processes before
// returning control to its caller. The cron entrypoint (§16/§8 of the
// mission brief - there is no real job queue in this codebase to lean
// on, see the architecture report) passes a small value so one cron
// tick stays fast; the in-process fire-and-forget path kicked off by
// POST .../send passes a high cap so a single send runs to completion
// without waiting for the next cron tick.
const CRON_TICK_MAX_BATCHES = 25;
const IN_PROCESS_MAX_BATCHES = 1_000_000; // effectively unbounded, loop still checks status every batch

// Small pacing delay between batches - keeps a huge broadcast from
// hammering Postgres and the push providers back-to-back with no
// breathing room, and keeps each batch's await chain cooperative with
// the rest of this (single, persistent) Node process's event loop.
const BATCH_DELAY_MS = 75;

const LOCK_TTL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Prevents two batch-processing runs for the SAME announcement from
 * overlapping - the realistic case is the in-process fire-and-forget
 * loop (started by POST .../send) still running when a cron tick also
 * picks up the same still-SENDING announcement. Each batch is already
 * idempotent on its own (Notification's @@unique([announcementId,
 * userId]) + createMany's skipDuplicates - see schema.prisma), so an
 * overlap could not corrupt data, but it would double the push-provider
 * traffic and double-count processedCount. A plain Redis SET NX PX lock
 * is sufficient; this is a low-frequency admin action, not a
 * high-contention path that needs anything fancier (no Redlock library
 * is installed in this codebase - see src/lib/redis.ts). If Redis is
 * unavailable, processing proceeds without the lock rather than
 * blocking the broadcast entirely - the atomic DRAFT/SCHEDULED->SENDING
 * transition is still the real duplicate-SEND guard; this lock only
 * guards against double-processing BATCHES of an already-SENDING one.
 */
async function withBroadcastLock<T>(announcementId: string, fn: () => Promise<T>): Promise<T | "locked"> {
  const redis = await getRedisClient();
  const lockKey = `lock:broadcast:${announcementId}`;
  if (!redis) return fn();

  const token = crypto.randomUUID();
  const acquired = await redis.set(lockKey, token, { NX: true, PX: LOCK_TTL_MS });
  if (!acquired) return "locked";
  try {
    return await fn();
  } finally {
    try {
      const current = await redis.get(lockKey);
      if (current === token) await redis.del(lockKey);
    } catch {
      // Lock expires on its own via PX above even if release fails.
    }
  }
}

async function dispatchPushForBatch(announcement: Announcement, userIds: string[]): Promise<void> {
  const title = announcement.title;
  const body = truncateForPush(announcement.body);
  const url = announcement.actionUrl ?? "/";

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < userIds.length) {
      const userId = userIds[nextIndex++];
      try {
        // The single authoritative push dispatch path (FCM + APNs + Web
        // Push) - see src/lib/push-notifications.ts. Not reimplemented
        // here; this is the only call site new for the broadcast
        // feature. It already catches and logs its own per-provider
        // errors internally and never throws for an individual failure
        // (invalid/expired token, provider timeout, etc.) - one bad
        // device must never abort the batch.
        await sendPushNotification(userId, title, body, url);
      } catch (err) {
        // Backstop only - see comment above on why this shouldn't
        // normally trigger.
        console.error("[broadcast] unexpected push dispatch error", {
          announcementId: announcement.id,
          userId,
          err,
        });
      }
    }
  }

  const workerCount = Math.min(PUSH_CONCURRENCY, userIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function finalizeIfExhausted(announcement: Announcement): Promise<boolean> {
  const status: AnnouncementStatus =
    announcement.failedBatchCount > 0
      ? announcement.processedCount > 0
        ? "PARTIAL"
        : "FAILED"
      : "SENT";

  const result = await prisma.announcement.updateMany({
    where: { id: announcement.id, status: "SENDING" },
    data: { status, completedAt: new Date() },
  });
  return result.count === 1;
}

async function runBatches(announcementId: string, maxBatches: number): Promise<void> {
  const systemUserId = await getAnnouncementSystemUserId();

  for (let i = 0; i < maxBatches; i++) {
    const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) return;
    // Stops cleanly if cancelled mid-flight (status flipped away from
    // SENDING by POST .../cancel) or already finished by another
    // process - batches already sent stay sent, no partial rollback;
    // see the mission's explicit "don't pretend a partial broadcast can
    // be magically recalled" requirement.
    if (announcement.status !== "SENDING") return;

    const batch = await getEligibleUserIdBatch(systemUserId, announcement.lastProcessedUserId, BATCH_SIZE);

    if (batch.length === 0) {
      await finalizeIfExhausted(announcement);
      return;
    }

    let batchWriteFailed = false;
    try {
      // One bulk insert per batch of up to BATCH_SIZE, not one
      // createNotification() call per user - createNotification()'s
      // per-row email/self-check/block logic is tailored to single-actor
      // social notifications and isn't needed here (eligibility already
      // excludes blockers of the system account; a broadcast never
      // emails - see types.ts/the final report's feature-creep notes).
      // skipDuplicates makes a replay of this exact batch (crash/restart
      // resume) a no-op instead of an error or a duplicate row, backed
      // by Notification's @@unique([announcementId, userId]).
      await prisma.notification.createMany({
        data: batch.map((userId) => ({
          userId,
          type: "announcement",
          fromUserId: systemUserId,
          announcementId: announcement.id,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      batchWriteFailed = true;
      console.error("[broadcast] failed to write a notification batch", {
        announcementId,
        batchSize: batch.length,
        err,
      });
    }

    // Push dispatch still runs even if the in-app row write failed for
    // this batch - two independent delivery channels, same principle as
    // sendPushNotification's own per-provider isolation.
    await dispatchPushForBatch(announcement, batch);

    await prisma.announcement.update({
      where: { id: announcementId },
      data: {
        processedCount: { increment: batch.length },
        lastProcessedUserId: batch[batch.length - 1],
        ...(batchWriteFailed ? { failedBatchCount: { increment: 1 } } : {}),
      },
    });

    if (i < maxBatches - 1) await sleep(BATCH_DELAY_MS);
  }
}

/**
 * Process up to `maxBatches` batches of a SENDING announcement,
 * resuming from wherever lastProcessedUserId left off. Safe to call
 * repeatedly/concurrently for the same announcement - the Redis lock
 * above serializes actual work, and every batch is independently
 * idempotent regardless.
 */
export async function processBroadcastBatches(
  announcementId: string,
  options?: { maxBatches?: number }
): Promise<void> {
  const maxBatches = options?.maxBatches ?? CRON_TICK_MAX_BATCHES;
  const result = await withBroadcastLock(announcementId, () => runBatches(announcementId, maxBatches));
  if (result === "locked") {
    console.log("[broadcast] skipped - already being processed by another run", { announcementId });
  }
}

/**
 * Fire-and-forget entry point called by POST .../send right after the
 * atomic DRAFT/SCHEDULED -> SENDING transition succeeds. NOT awaited by
 * the HTTP route - server.js is a long-lived persistent Node process
 * (not a serverless function frozen after the response is sent, see
 * CLAUDE.md), so scheduling this after the response returns is safe and
 * lets "Send to all" return immediately instead of holding the request
 * open for however long the whole broadcast takes (mission §27). The
 * cron route (/api/cron/broadcasts) is the crash-safety net: if this
 * process dies mid-send, the announcement is left in SENDING with a
 * valid lastProcessedUserId cursor, and the next cron tick resumes it
 * exactly where it left off.
 */
export function kickOffBroadcastProcessing(announcementId: string): void {
  void processBroadcastBatches(announcementId, { maxBatches: IN_PROCESS_MAX_BATCHES }).catch((err) => {
    console.error("[broadcast] in-process dispatch run failed", { announcementId, err });
  });
}

export async function processDueBroadcastsForCronTick(): Promise<{ promoted: string[]; processed: string[] }> {
  const promoted = await promoteDueScheduledAnnouncements();

  const sending = await prisma.announcement.findMany({
    where: { status: "SENDING" },
    select: { id: true },
  });

  for (const { id } of sending) {
    await processBroadcastBatches(id, { maxBatches: CRON_TICK_MAX_BATCHES });
  }

  return { promoted, processed: sending.map((s) => s.id) };
}

async function promoteDueScheduledAnnouncements(): Promise<string[]> {
  const due = await prisma.announcement.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
  });

  const promotedIds: string[] = [];
  for (const { id } of due) {
    const outcome = await beginSending(id);
    if (outcome.started) promotedIds.push(id);
  }
  return promotedIds;
}

export type BeginSendingResult =
  | { started: true; totalRecipients: number }
  | { started: false; currentStatus: AnnouncementStatus };

/**
 * The atomic DRAFT/SCHEDULED -> SENDING transition - the single
 * mechanism preventing a double-send (double-click, duplicate HTTP
 * request, or a race between the explicit Send button and a scheduled
 * announcement's own due-time promotion). Only one caller's UPDATE can
 * ever match a given row's current status; every other concurrent
 * caller's UPDATE matches zero rows and is told the announcement's
 * actual current state instead of starting a second broadcast.
 */
export async function beginSending(announcementId: string): Promise<BeginSendingResult> {
  const systemUserId = await getAnnouncementSystemUserId();
  const totalRecipients = await countEligibleRecipients(systemUserId);

  const result = await prisma.announcement.updateMany({
    where: { id: announcementId, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "SENDING", sendStartedAt: new Date(), totalRecipients },
  });

  if (result.count === 1) return { started: true, totalRecipients };

  const current = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { status: true },
  });
  return { started: false, currentStatus: current?.status ?? "DRAFT" };
}

export type CancelResult = { cancelled: true } | { cancelled: false; currentStatus: AnnouncementStatus };

/**
 * DRAFT/SCHEDULED -> CANCELLED is a full cancel (nothing was ever sent).
 * SENDING -> CANCELLED is a "stop sending any further batches" cancel -
 * batches already processed are not and cannot be recalled (mission
 * §17: cancellation behavior must be explicitly defined, not implied to
 * undo delivered notifications/push). runBatches() checks status at the
 * start of every batch, so this takes effect within at most one
 * in-flight batch.
 */
export async function cancelAnnouncement(announcementId: string): Promise<CancelResult> {
  const result = await prisma.announcement.updateMany({
    where: { id: announcementId, status: { in: ["DRAFT", "SCHEDULED", "SENDING"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  if (result.count === 1) return { cancelled: true };

  const current = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { status: true },
  });
  return { cancelled: false, currentStatus: current?.status ?? "CANCELLED" };
}
