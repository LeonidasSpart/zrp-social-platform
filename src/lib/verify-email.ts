import { prisma } from "./db";
import { hashToken } from "./tokens";

export type ConsumeVerificationTokenResult =
  | { ok: true; userId: string }
  | { ok: false; error: "missing_token" | "invalid_or_expired" };

/**
 * Consumes a one-time email-verification token: looks it up, checks
 * expiry, then marks the account verified.
 *
 * This is the single source of truth for that logic. It used to be
 * duplicated across two separate routes (/api/auth/verify and
 * /api/auth/verify-email) that drifted apart - one of them at one
 * point didn't handle the pendingEmail (email-change) case at all,
 * which broke normal registration verification links until it was
 * fixed there and only there. Both routes now call this function so
 * that kind of divergence can't happen again; each route is still
 * free to shape its own HTTP response (JSON vs. redirect) for its own
 * caller.
 */
export async function consumeVerificationToken(
  token: string | null | undefined
): Promise<ConsumeVerificationTokenResult> {
  if (!token) return { ok: false, error: "missing_token" };

  const user = await prisma.user.findFirst({
    where: {
      verificationToken: hashToken(token),
      verificationTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) return { ok: false, error: "invalid_or_expired" };

  // Two flows share this same token field:
  //  1. Normal registration - just mark the existing email verified.
  //  2. Email change (pendingEmail set) - the new address replaces
  //     the old one as part of the same verification.
  const updateData = user.pendingEmail
    ? {
        email: user.pendingEmail,
        pendingEmail: null,
        verificationToken: null,
        verificationTokenExpiry: null,
        emailVerified: new Date(),
      }
    : {
        verificationToken: null,
        verificationTokenExpiry: null,
        emailVerified: new Date(),
      };

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  return { ok: true, userId: user.id };
}
