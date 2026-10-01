import { prisma } from "@/lib/db";

/**
 * "ALL ELIGIBLE USERS" for a broadcast - NOT every row in the User
 * table. Mirrors the account-state rules already enforced elsewhere in
 * this codebase rather than inventing new ones:
 *  - banned accounts get no session at all (src/lib/auth.ts's session
 *    callback) and must not receive platform notifications either.
 *  - an account with deletionRequestedAt set has asked to leave the
 *    platform (src/app/api/cron/delete-scheduled-accounts/route.ts
 *    eventually hard-deletes it); it should stop receiving broadcast
 *    notifications from the moment that request is made, not only
 *    once the scheduled deletion actually runs.
 *  - the reserved system account itself (see system-user.ts) is
 *    excluded so a broadcast never "notifies" its own sender actor.
 *  - a user who has blocked the system account is excluded, the same
 *    way isBlockedEitherWay() suppresses any other notification
 *    between two accounts (src/lib/auth-guards.ts) - createNotification()
 *    isn't used for the bulk path (see dispatch.ts for why), so this
 *    reimplements just that one exclusion as a set-based query instead
 *    of a per-row check.
 */
export function eligibleUserWhere(systemUserId: string) {
  return {
    banned: false,
    deletionRequestedAt: null,
    id: { not: systemUserId },
    // `blockedUsers` is this user's own outgoing blocks (User.blockedUsers
    // -> Blocked @relation("Blocker")) - excludes anyone who has blocked
    // the system account, not anyone the system account has blocked
    // (which never happens; the system account blocks no one).
    blockedUsers: { none: { blockedId: systemUserId } },
  } as const;
}

export async function countEligibleRecipients(systemUserId: string): Promise<number> {
  return prisma.user.count({ where: eligibleUserWhere(systemUserId) });
}

/**
 * Cursor-paginated batch of eligible user ids, ordered by id (the
 * primary key - already indexed, so this is an indexed range scan, not
 * an OFFSET skip). Safe at any table size: each call only ever touches
 * `batchSize` rows regardless of how far into the user base the cursor
 * already is.
 */
export async function getEligibleUserIdBatch(
  systemUserId: string,
  afterUserId: string | null,
  batchSize: number
): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      ...eligibleUserWhere(systemUserId),
      ...(afterUserId ? { id: { gt: afterUserId } } : {}),
    },
    orderBy: { id: "asc" },
    take: batchSize,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
