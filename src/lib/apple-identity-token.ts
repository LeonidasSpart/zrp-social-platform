import crypto from "crypto";

/**
 * Verifies the identity token a NATIVE Sign in with Apple returns.
 *
 * The website's Apple sign-in is NextAuth's browser redirect flow, and
 * NextAuth verifies that token itself. An iOS app instead gets an
 * `ASAuthorizationAppleIDCredential` straight from the system - no
 * browser, no authorization code - so nothing in the web flow can take
 * it, and POST /api/mobile/auth/apple has to verify it here. This is the
 * exact counterpart of what google-auth-library's verifyIdToken() does
 * for POST /api/mobile/auth/google.
 *
 * Written against Node's built-in crypto rather than adding a JWT
 * library, the same choice apple-client-secret.ts already made in this
 * codebase: `crypto.createPublicKey({ format: "jwk" })` builds a key
 * straight from Apple's published JWKS, and `crypto.verify` checks the
 * RS256 signature over the signing input.
 *
 * ⚠️ SECURITY: a client-supplied token is worth nothing until every one
 * of these holds. All of them are checked, in this order, and any
 * failure is reported to the caller as one indistinguishable error - a
 * verifier that says *which* check failed helps an attacker tune a
 * forgery.
 *
 *   1. The header names RS256 and a key id Apple currently publishes.
 *   2. The signature verifies against that key.
 *   3. iss is exactly https://appleid.apple.com.
 *   4. aud is one of ours (the app's bundle id for native; the Services
 *      ID stays with the web flow).
 *   5. exp is in the future and iat is not in the future, both with a
 *      small clock-skew allowance.
 *   6. The nonce matches the one this sign-in attempt started with -
 *      this is what stops a token captured from another session being
 *      replayed here.
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";

// Apple rotates its signing keys, publishes several at once, and asks
// clients not to hard-code them. Refetched when a token names a key id
// this cache does not hold, and otherwise reused for this long.
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

interface AppleJwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

export interface AppleIdentity {
  /** Apple's stable per-user id (`sub`). Unique per Apple ID per team. */
  subject: string;
  /**
   * Either the real address or a `@privaterelay.appleid.com` alias, when
   * the user chose to hide it. Both are stable for this app, and both
   * work as an account key - the relay address forwards real mail.
   */
  email: string;
  emailVerified: boolean;
  isPrivateRelay: boolean;
}

let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="), "base64");
}

async function fetchAppleKeys(): Promise<AppleJwk[]> {
  const response = await fetch(APPLE_KEYS_URL, {
    headers: { accept: "application/json" },
    // Apple's JWKS is public and cacheable; this is the only outbound
    // call the route makes.
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Apple JWKS request failed: ${response.status}`);
  }
  const body = (await response.json()) as { keys?: AppleJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error("Apple JWKS response contained no keys");
  }
  return body.keys;
}

async function signingKey(kid: string): Promise<AppleJwk | null> {
  const fresh = cachedKeys && Date.now() - cachedKeys.fetchedAt < KEY_CACHE_TTL_MS;
  if (fresh) {
    const hit = cachedKeys!.keys.find((key) => key.kid === kid);
    if (hit) return hit;
    // A key id we have never seen means Apple has rotated: fall through
    // and refetch rather than rejecting a legitimate token.
  }

  const keys = await fetchAppleKeys();
  cachedKeys = { keys, fetchedAt: Date.now() };
  return keys.find((key) => key.kid === kid) ?? null;
}

/**
 * Returns the verified identity, or null if the token is not
 * trustworthy for any reason.
 *
 * @param identityToken the raw JWT from ASAuthorizationAppleIDCredential
 * @param audiences     every client id this server accepts (the iOS
 *                      bundle id for native sign-in)
 * @param expectedNonce the raw nonce the client generated for this
 *                      attempt; Apple echoes its SHA-256 in the token
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  audiences: string[],
  expectedNonce: string
): Promise<AppleIdentity | null> {
  try {
    const parts = identityToken.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf-8")) as {
      alg?: string;
      kid?: string;
    };
    // Pinned to RS256, which is what Apple signs identity tokens with.
    // Accepting whatever the header names is the classic JWT
    // vulnerability - "alg": "none" and HS256-signed-with-the-public-key
    // both live there.
    if (header.alg !== "RS256" || !header.kid) return null;

    const jwk = await signingKey(header.kid);
    if (!jwk || jwk.kty !== "RSA") return null;

    const publicKey = crypto.createPublicKey({
      key: { kty: jwk.kty, n: jwk.n, e: jwk.e } as crypto.JsonWebKey,
      format: "jwk",
    });

    const signatureValid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      publicKey,
      base64UrlDecode(encodedSignature)
    );
    if (!signatureValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf-8")) as {
      iss?: string;
      aud?: string | string[];
      sub?: string;
      email?: string;
      email_verified?: boolean | string;
      is_private_email?: boolean | string;
      nonce?: string;
      exp?: number;
      iat?: number;
    };

    if (payload.iss !== APPLE_ISSUER) return null;

    const tokenAudiences = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    if (!tokenAudiences.some((aud) => audiences.includes(aud))) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) return null;
    if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > now) return null;

    // Apple echoes the SHA-256 of whatever the app set as the request
    // nonce, hex-encoded. The app sets that hash and keeps the raw value,
    // so the comparison is against the hash of what the client sends
    // back. Compared in constant time out of habit, not because the
    // nonce is a secret.
    const expectedHash = crypto.createHash("sha256").update(expectedNonce).digest("hex");
    const presented = typeof payload.nonce === "string" ? payload.nonce : "";
    const expectedBuffer = Buffer.from(expectedHash);
    const presentedBuffer = Buffer.from(presented);
    if (
      presentedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(presentedBuffer, expectedBuffer)
    ) {
      return null;
    }

    if (!payload.sub || !payload.email) return null;

    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";
    // A relay address is issued by Apple and is verified by definition;
    // Apple still reports email_verified for it, and this does not
    // second-guess that.
    if (!emailVerified) return null;

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified,
      isPrivateRelay:
        payload.is_private_email === true || payload.is_private_email === "true",
    };
  } catch {
    // Network failure, malformed token, unusable key - all the same
    // answer to the caller: this token cannot be trusted.
    return null;
  }
}
