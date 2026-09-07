import crypto from "crypto";

// Verifies a native `ASAuthorizationAppleIDCredential.identityToken` (a JWT
// signed by Apple) against Apple's own published JWKS - the backend half of
// native Sign in with Apple that ios-native/PARITY.md's "B2" audit calls
// out as missing. This mirrors NextAuth's own OIDC verification (used for
// the *web* Apple OAuth provider in src/lib/auth.ts) by hand, using only
// Node's built-in crypto, for the same reason apple-client-secret.ts
// signs its JWT by hand: no new JWT/JWKS dependency for one call site.

const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

// Apple rotates its signing keys infrequently and documents caching the
// JWKS rather than fetching it on every verification. A missing `kid`
// forces one synchronous refetch (below) so a real key rotation can never
// wedge verification for the full TTL.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function fetchAppleKeys(forceRefresh: boolean): Promise<AppleJwk[]> {
  if (!forceRefresh && cachedKeys && Date.now() - cachedKeys.fetchedAt < CACHE_TTL_MS) {
    return cachedKeys.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Apple JWKS (status ${res.status})`);
  }
  const data = (await res.json()) as { keys: AppleJwk[] };
  cachedKeys = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

export async function verifyAppleIdentityToken(
  idToken: string,
  { audiences, nonce }: { audiences: string[]; nonce?: string }
): Promise<AppleIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Apple identity token");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(fromBase64Url(headerB64).toString("utf8"));
    payload = JSON.parse(fromBase64Url(payloadB64).toString("utf8"));
  } catch {
    throw new Error("Malformed Apple identity token");
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unexpected Apple identity token header");
  }

  let keys = await fetchAppleKeys(false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await fetchAppleKeys(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    throw new Error("No matching Apple signing key for this token");
  }

  const publicKey = crypto.createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: "jwk",
  });

  const signatureValid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    fromBase64Url(signatureB64)
  );
  if (!signatureValid) {
    throw new Error("Invalid Apple identity token signature");
  }

  if (payload.iss !== APPLE_ISSUER) {
    throw new Error("Unexpected Apple identity token issuer");
  }

  const aud = payload.aud;
  const audienceOk =
    typeof aud === "string"
      ? audiences.includes(aud)
      : Array.isArray(aud) && aud.some((a) => typeof a === "string" && audiences.includes(a));
  if (!audienceOk) {
    throw new Error("Unexpected Apple identity token audience");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("Apple identity token has expired");
  }

  // When the client set a raw nonce on ASAuthorizationAppleIDRequest,
  // Apple embeds SHA-256(rawNonce) (hex) as the `nonce` claim rather than
  // echoing it back raw the way Google does. Verification is optional
  // here (skipped when the caller doesn't supply one) so this route
  // doesn't require every client to already implement it, but a supplied
  // nonce that doesn't match is always rejected outright.
  if (nonce) {
    const expectedHashedNonce = crypto.createHash("sha256").update(nonce).digest("hex");
    if (payload.nonce !== expectedHashedNonce) {
      throw new Error("Apple identity token nonce mismatch");
    }
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Apple identity token missing subject");
  }

  // Apple has shipped both real booleans and stringified "true"/"false"
  // for these two claims across SDK versions - never trust the literal
  // JS type.
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  const isPrivateEmail = payload.is_private_email === true || payload.is_private_email === "true";

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified,
    isPrivateEmail,
  };
}
