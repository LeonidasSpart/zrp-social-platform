import crypto from "crypto";

/**
 * NextAuth v4's built-in Apple provider (node_modules/next-auth/src/providers/apple.ts)
 * expects `clientSecret` to already be a signed JWT string - unlike Google,
 * it does not generate this itself, and Apple's own client-secret JWTs
 * expire after at most ~6 months. Rather than asking the owner to hand-
 * regenerate and redeploy a static secret every few months, this signs a
 * fresh one from the raw private key on every server start, using only
 * Node's built-in crypto module (no new dependency: `crypto.sign` with
 * `dsaEncoding: "ieee-p1363"` produces the raw r||s signature format JWS/
 * ES256 requires, which is otherwise only available via a JWT library).
 *
 * Required env vars (see .env / README for the values these need):
 *   APPLE_TEAM_ID     - Apple Developer Team ID
 *   APPLE_KEY_ID      - the Key ID of the "Sign In with Apple" private key
 *   APPLE_CLIENT_ID   - the Services ID configured for Sign In with Apple
 *   APPLE_PRIVATE_KEY - the .p8 private key's PEM contents, with actual
 *                       newlines escaped as literal "\n" (env vars can't
 *                       hold a raw multi-line value)
 *
 * Returns null - never throws - when any of these are missing or the key
 * is malformed, so callers can treat "not configured" as a normal,
 * expected state (see auth.ts, which only registers the Apple provider
 * when this succeeds) rather than a startup crash.
 */
function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function getAppleClientSecret(): string | null {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const rawKey = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !clientId || !rawKey) {
    return null;
  }

  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    // Apple's documented maximum lifetime for this secret is 6 months;
    // using ~5 here leaves headroom since it's regenerated on every
    // server start anyway, not persisted.
    exp: now + 60 * 60 * 24 * 30 * 5,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  try {
    const signature = crypto.sign("sha256", Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${base64url(signature)}`;
  } catch (err) {
    console.error("Failed to generate Apple client secret JWT (check APPLE_PRIVATE_KEY):", err);
    return null;
  }
}
