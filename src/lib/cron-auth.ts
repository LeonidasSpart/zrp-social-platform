import crypto from "crypto";

/**
 * Shared auth for every /api/cron/* route: `Authorization: Bearer
 * <CRON_SECRET>`. Fails CLOSED when CRON_SECRET is unset. The comparison
 * is constant-time (both sides hashed to a fixed length first, so the
 * secret's length isn't leaked either) instead of a plain `!==`, whose
 * early exit on the first differing character is a timing oracle on the
 * secret.
 */
export function isAuthorizedCronRequest(authHeader: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const presented = crypto.createHash("sha256").update(authHeader).digest();
  const expected = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(presented, expected);
}
