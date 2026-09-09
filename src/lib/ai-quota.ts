import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/*
 * ============================================================
 * AI daily quota - atomic reservation
 * ============================================================
 *
 * ⚠️ SECURITY: /api/ai/chat used to read AIDailyUsage, compare it to
 * the plan's limit, call the model, and only THEN increment the
 * counter. Every request in flight at the same moment saw the same
 * pre-increment count, so N concurrent requests from a free account
 * with 9/10 used all passed the check and all ran - the daily limit
 * was a suggestion, and the cost of every extra call landed on ZRP's
 * DeepSeek bill. Firing 100 requests in one burst was enough.
 *
 * reserveAiMessage() claims a slot BEFORE the model is called, in a
 * single conditional UPDATE the database serialises:
 *
 *   UPDATE "AIDailyUsage" SET messages = messages + 1
 *    WHERE userId = ? AND date = ? AND messages < ?
 *
 * Two requests racing for the last slot: exactly one UPDATE matches.
 * A user with no row yet for today gets one via a create that the
 * (userId, date) unique constraint protects - a lost create race just
 * retries the UPDATE. If the model call then fails, the slot is
 * handed back with releaseAiMessage() so a provider outage doesn't
 * eat the user's quota.
 *
 * The row and unique key are the existing ones; no schema change.
 */

export interface AiQuotaReservation {
  ok: boolean;
  /** Messages used today INCLUDING this reservation (when ok). */
  used: number;
  limit: number;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Start of today in server-local time - the same key /api/ai/chat always used. */
export function aiUsageDateKey(now: Date = new Date()): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

async function tryIncrementWithinLimit(userId: string, date: Date, limit: number): Promise<boolean> {
  const result = await prisma.aIDailyUsage.updateMany({
    where: { userId, date, messages: { lt: limit } },
    data: { messages: { increment: 1 } },
  });
  return result.count === 1;
}

export async function reserveAiMessage(
  userId: string,
  limit: number,
  date: Date = aiUsageDateKey()
): Promise<AiQuotaReservation> {
  if (limit <= 0) return { ok: false, used: 0, limit };

  if (!(await tryIncrementWithinLimit(userId, date, limit))) {
    const existing = await prisma.aIDailyUsage.findUnique({
      where: { userId_date: { userId, date } },
      select: { messages: true },
    });

    if (existing) {
      // Row exists and is at (or over) the limit.
      return { ok: false, used: existing.messages, limit };
    }

    try {
      await prisma.aIDailyUsage.create({
        data: { userId, date, messages: 1, tokensUsed: 0 },
      });
      return { ok: true, used: 1, limit };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Someone else created today's row between our read and create;
      // fall through to the conditional increment against it.
      if (!(await tryIncrementWithinLimit(userId, date, limit))) {
        const after = await prisma.aIDailyUsage.findUnique({
          where: { userId_date: { userId, date } },
          select: { messages: true },
        });
        return { ok: false, used: after?.messages ?? limit, limit };
      }
    }
  }

  const row = await prisma.aIDailyUsage.findUnique({
    where: { userId_date: { userId, date } },
    select: { messages: true },
  });
  return { ok: true, used: row?.messages ?? 1, limit };
}

/** Hand a reserved slot back (model call never produced a response). */
export async function releaseAiMessage(userId: string, date: Date = aiUsageDateKey()): Promise<void> {
  await prisma.aIDailyUsage.updateMany({
    where: { userId, date, messages: { gt: 0 } },
    data: { messages: { decrement: 1 } },
  });
}

/** Record the tokens a completed response consumed (the slot is already counted). */
export async function recordAiTokens(
  userId: string,
  tokens: number,
  date: Date = aiUsageDateKey()
): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  await prisma.aIDailyUsage.updateMany({
    where: { userId, date },
    data: { tokensUsed: { increment: Math.floor(tokens) } },
  });
}
