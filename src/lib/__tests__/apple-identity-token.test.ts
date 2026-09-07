import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

import { verifyAppleIdentityToken } from "../apple-identity-token";

// Security coverage for the native Sign in with Apple verifier
// (src/lib/apple-identity-token.ts). This function is the ONLY thing
// standing between a string a phone sent and a 30-day ZRP session, so
// every check it makes is tested by producing a token that violates
// exactly that check and asserting it is refused.
//
// A synthetic, randomly generated, disposable RSA keypair stands in for
// Apple's - it is not a real Apple credential and is never used for
// anything else. `fetch` is stubbed to serve its public half as Apple's
// JWKS, which is what lets a forged token be *correctly signed by the
// wrong key* and still rejected.

const AUDIENCE = "one.zrp.social";
const KID = "test-key-id";
const RAW_NONCE = "a1b2c3d4e5f6";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const otherKeyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function jwks(key: crypto.KeyObject, kid = KID) {
  const jwk = key.export({ format: "jwk" }) as crypto.JsonWebKey;
  return { keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] };
}

/** Signs a token with the test key, letting any part of it be overridden. */
function makeToken(
  overrides: {
    header?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    signWith?: crypto.KeyObject;
    signature?: string;
  } = {}
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: KID, ...overrides.header };
  const payload = {
    iss: "https://appleid.apple.com",
    aud: AUDIENCE,
    sub: "001234.abcdef.0000",
    email: "person@privaterelay.appleid.com",
    email_verified: "true",
    is_private_email: "true",
    nonce: crypto.createHash("sha256").update(RAW_NONCE).digest("hex"),
    iat: now - 10,
    exp: now + 600,
    ...overrides.payload,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`;

  const signature =
    overrides.signature ??
    base64url(
      crypto.sign("RSA-SHA256", Buffer.from(signingInput), overrides.signWith ?? privateKey)
    );

  return `${signingInput}.${signature}`;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(jwks(publicKey)), { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyAppleIdentityToken", () => {
  it("accepts a correctly signed token and reports the private-relay identity", async () => {
    const identity = await verifyAppleIdentityToken(makeToken(), [AUDIENCE], RAW_NONCE);

    expect(identity).not.toBeNull();
    expect(identity?.subject).toBe("001234.abcdef.0000");
    expect(identity?.email).toBe("person@privaterelay.appleid.com");
    expect(identity?.emailVerified).toBe(true);
    // A relay address is a legitimate, stable account key - not a reason
    // to refuse the sign-in.
    expect(identity?.isPrivateRelay).toBe(true);
  });

  it("rejects a token signed by a key that is not Apple's", async () => {
    const forged = makeToken({ signWith: otherKeyPair.privateKey });
    expect(await verifyAppleIdentityToken(forged, [AUDIENCE], RAW_NONCE)).toBeNull();
  });

  it("rejects a tampered payload whose signature no longer covers it", async () => {
    const token = makeToken();
    const [header, , signature] = token.split(".");
    const swapped = base64url(
      JSON.stringify({
        iss: "https://appleid.apple.com",
        aud: AUDIENCE,
        sub: "attacker",
        email: "victim@zrp.one",
        email_verified: "true",
        nonce: crypto.createHash("sha256").update(RAW_NONCE).digest("hex"),
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    );
    expect(
      await verifyAppleIdentityToken(`${header}.${swapped}.${signature}`, [AUDIENCE], RAW_NONCE)
    ).toBeNull();
  });

  it('rejects alg "none" - the classic JWT forgery', async () => {
    const header = base64url(JSON.stringify({ alg: "none", kid: KID }));
    const payload = base64url(
      JSON.stringify({
        iss: "https://appleid.apple.com",
        aud: AUDIENCE,
        sub: "attacker",
        email: "victim@zrp.one",
        email_verified: "true",
        nonce: crypto.createHash("sha256").update(RAW_NONCE).digest("hex"),
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    );
    expect(
      await verifyAppleIdentityToken(`${header}.${payload}.`, [AUDIENCE], RAW_NONCE)
    ).toBeNull();
  });

  it("rejects an algorithm other than RS256 even when the signature is real", async () => {
    // The header lies about the algorithm; the verifier must go by its
    // own pinned choice, not by what the token claims.
    expect(
      await verifyAppleIdentityToken(
        makeToken({ header: { alg: "HS256" } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects a token issued by anyone but Apple", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { iss: "https://evil.example.com" } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects a token minted for a different app", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { aud: "com.someone.else" } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("accepts the audience when the server allows several", async () => {
    const identity = await verifyAppleIdentityToken(
      makeToken({ payload: { aud: "one.zrp.social.web" } }),
      [AUDIENCE, "one.zrp.social.web"],
      RAW_NONCE
    );
    expect(identity).not.toBeNull();
  });

  it("rejects an expired token", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { exp: Math.floor(Date.now() / 1000) - 3600 } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects a token issued in the future", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { iat: Math.floor(Date.now() / 1000) + 3600 } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects a token whose nonce belongs to a different sign-in attempt", async () => {
    // This is the replay case: a real, unexpired, correctly signed Apple
    // token captured from somewhere else must not open a session here.
    expect(await verifyAppleIdentityToken(makeToken(), [AUDIENCE], "a-different-nonce")).toBeNull();
  });

  it("rejects a token carrying no nonce at all", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { nonce: undefined } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects an unverified email", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { email_verified: "false" } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects a token with no email - there would be no account key", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ payload: { email: undefined } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects a token naming a key id Apple does not publish", async () => {
    expect(
      await verifyAppleIdentityToken(
        makeToken({ header: { kid: "not-a-real-key" } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("rejects malformed input rather than throwing", async () => {
    for (const bad of ["", "not-a-jwt", "a.b", "a.b.c.d", "...."]) {
      expect(await verifyAppleIdentityToken(bad, [AUDIENCE], RAW_NONCE)).toBeNull();
    }
  });

  it("refuses rather than throws when Apple's JWKS endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    // A key id the module's cache cannot already hold, so the lookup has
    // to go to the network and therefore has to survive it failing. (A
    // token signed by an already-cached key legitimately still verifies
    // while Apple is unreachable - that is the point of the cache.)
    expect(
      await verifyAppleIdentityToken(
        makeToken({ header: { kid: "never-fetched-key" } }),
        [AUDIENCE],
        RAW_NONCE
      )
    ).toBeNull();
  });

  it("refetches the JWKS when Apple rotates to a key id it has not seen", async () => {
    // Warm the cache with the current key.
    expect(await verifyAppleIdentityToken(makeToken(), [AUDIENCE], RAW_NONCE)).not.toBeNull();

    // Apple now signs with a new key id; the cached set does not have it,
    // so a correct token must still be accepted after a refetch rather
    // than being rejected until the cache expires.
    const rotatedKid = "rotated-key-id";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(jwks(otherKeyPair.publicKey, rotatedKid)), { status: 200 })
      )
    );

    const identity = await verifyAppleIdentityToken(
      makeToken({ header: { kid: rotatedKid }, signWith: otherKeyPair.privateKey }),
      [AUDIENCE],
      RAW_NONCE
    );
    expect(identity).not.toBeNull();
  });
});
