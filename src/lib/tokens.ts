import crypto from "crypto";

/**
 * Deterministic hash used to store one-time tokens (password reset,
 * email verification) at rest. The raw token is emailed to the user
 * and only ever compared by re-hashing the value presented back to
 * us, so the database never holds a usable copy of the secret.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
