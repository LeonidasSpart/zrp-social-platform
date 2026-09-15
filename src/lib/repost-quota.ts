import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/*
 * ============================================================
 * Repost daily quota - atomic reservation
 * ============================================================
 *
 * No repost quota existed anywhere in this codebase before this file -
 * reposting was previously unlimited per user/day (confirmed by a
 * full-repo audit for "quota"/"repostLimit"/etc; the only hits were an
 * unrelated AI daily quota). This mirrors reserveAiMessage()
 * (src/lib/ai-quota.ts) exactly, for the same reason that module
 * exists: the naive "read count, compare to limit, then increment"
 * pattern lets every request in flight at the same moment see the same
 * pre-increment count, so N concurrent repost requests near the limit
 * would all pass the check.
 *
 * reserveRepost() claims a slot BEFORE the repost row is created, in a
 * single conditional UPDATE the database serialises:
 *
 *   UPDATE "RepostDailyUsage" SET reposts = reposts + 1
 *    WHERE userId = ? AND date = ? AND reposts < ?
 *
 * Two requests racing for the last slot: exactly one UPDATE matches.
 * A user with no row yet for today gets one via a create that the
 * (userId, date) unique constraint protects - a lost create race just
 * retries the UPDATE. If the repost then fails for an unrelated reason
 * (post not found, blocked author, DB error), the slot is handed back
 * with releaseRepost() so the user doesn't lose a quota slot for a
 * repost that never actually happened.
 *
 * Undoing a repost does NOT restore the slot - this is a deliberate
 * choice (see docs/notifications-social-interactions.md), matching how
 * most social platforms treat repost quota as consumption, not
 * "reposts currently in effect": restoring on undo would let a user
 * toggle repost/un-repost in a loop to bypass the daily limit entirely.
 */

export interface RepostQuotaReservation {
  ok: boolean;
  /** Reposts used today INCLUDING this reservation (when ok). */
  used: number;
  limit: number;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Start of today in server-local time - the same key reserveAiMessage() uses. */
export function repostUsageDateKey(now: Date = new Date()): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

async function tryIncrementWithinLimit(userId: string, date: Date, limit: number): Promise<boolean> {
  const result = await prisma.repostDailyUsage.updateMany({
    where: { userId, date, reposts: { lt: limit } },
    data: { reposts: { increment: 1 } },
  });
  return result.count === 1;
}

export async function reserveRepost(
  userId: string,
  limit: number,
  date: Date = repostUsageDateKey()
): Promise<RepostQuotaReservation> {
  if (limit <= 0) return { ok: false, used: 0, limit };

  if (!(await tryIncrementWithinLimit(userId, date, limit))) {
    const existing = await prisma.repostDailyUsage.findUnique({
      where: { userId_date: { userId, date } },
      select: { reposts: true },
    });

    if (existing) {
      // Row exists and is at (or over) the limit.
      return { ok: false, used: existing.reposts, limit };
    }

    try {
      await prisma.repostDailyUsage.create({
        data: { userId, date, reposts: 1 },
      });
      return { ok: true, used: 1, limit };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Someone else created today's row between our read and create;
      // fall through to the conditional increment against it.
      if (!(await tryIncrementWithinLimit(userId, date, limit))) {
        const after = await prisma.repostDailyUsage.findUnique({
          where: { userId_date: { userId, date } },
          select: { reposts: true },
        });
        return { ok: false, used: after?.reposts ?? limit, limit };
      }
    }
  }

  const row = await prisma.repostDailyUsage.findUnique({
    where: { userId_date: { userId, date } },
    select: { reposts: true },
  });
  return { ok: true, used: row?.reposts ?? 1, limit };
}

/** Hand a reserved slot back (the repost never actually landed). */
export async function releaseRepost(userId: string, date: Date = repostUsageDateKey()): Promise<void> {
  await prisma.repostDailyUsage.updateMany({
    where: { userId, date, reposts: { gt: 0 } },
    data: { reposts: { decrement: 1 } },
  });
}
