import { prisma } from "./db";

// A NextAuth JWT session is a self-contained signed token, not a live
// server-side record - it can still decode as "authenticated" (a valid
// signature, a plausible-looking session.user.id) after the User row
// it points to is gone: the account was deleted, or the cookie is just
// stale. Any route that's about to act on session.user.id must confirm
// that row still exists first, or a stale session either silently
// fails deep inside a Prisma call (update-to-missing-row) or, worse,
// looks like it succeeded against no one. This is the single shared
// check for that, used by every onboarding-lifecycle route that needs
// it instead of each re-implementing (and risking drifting from) its
// own version.
export async function findExistingSessionUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
}

export const ACCOUNT_NOT_FOUND_RESPONSE = {
  error: "User account no longer exists. Please sign in again.",
  code: "ACCOUNT_NOT_FOUND" as const,
};
