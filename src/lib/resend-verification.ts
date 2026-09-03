import crypto from "crypto";
import { prisma } from "./db";
import { sendVerificationEmail } from "./email";
import { hashToken } from "./tokens";

export type ResendVerificationResult =
  | { ok: true }
  | { ok: false; code: "USER_NOT_FOUND" | "ALREADY_VERIFIED" };

// Shared by POST /api/auth/resend-verification (the login page's "unverified"
// error, identified by whatever the user typed into the "Email or Username"
// field) and anywhere else that needs to trigger the exact same resend, so
// the two call sites can't drift into different lookup or token behavior.
export async function resendVerificationEmail(
  rawIdentifier: string
): Promise<ResendVerificationResult> {
  const identifier = rawIdentifier.trim();
  const isEmail = identifier.includes("@");

  const user = await prisma.user.findUnique({
    where: isEmail ? { email: identifier.toLowerCase() } : { username: identifier },
    select: { id: true, email: true, emailVerified: true },
  });

  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND" };
  }

  if (user.emailVerified) {
    return { ok: false, code: "ALREADY_VERIFIED" };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationToken: hashToken(token),
      verificationTokenExpiry: expiry,
    },
  });

  await sendVerificationEmail(user.email, token);

  return { ok: true };
}
