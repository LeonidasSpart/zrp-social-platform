import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

const APPLE_ISSUER = "https://appleid.apple.com";
const KEY_ID = "test-kid-1";

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeKeyPair() {
  return crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
}

function jwkFor(publicKey: crypto.KeyObject, kid: string) {
  const jwk = publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };
  return { kty: jwk.kty, kid, use: "sig", alg: "RS256", n: jwk.n, e: jwk.e };
}

function signToken(
  privateKey: crypto.KeyObject,
  kid: string,
  payload: Record<string, unknown>,
  alg = "RS256"
) {
  const header = { alg, kid };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

function stubAppleKeysEndpoint(keys: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ keys }),
    }))
  );
}

const basePayload = (overrides: Record<string, unknown> = {}) => ({
  iss: APPLE_ISSUER,
  aud: "one.zrp.social",
  exp: Math.floor(Date.now() / 1000) + 300,
  iat: Math.floor(Date.now() / 1000),
  sub: "000123.abcdef1234567890.1234",
  email: "private-relay@privaterelay.appleid.com",
  email_verified: "true",
  is_private_email: "true",
  ...overrides,
});

// Regression coverage for B2 (native Sign in with Apple): the backend must
// cryptographically verify an ASAuthorizationAppleIDCredential's
// identityToken against Apple's real JWKS rather than trusting any claim
// in it, exactly like NextAuth's own OIDC machinery already does for the
// web Apple OAuth provider.
describe("verifyAppleIdentityToken", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifies a validly-signed token and returns its identity claims", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(privateKey, KEY_ID, basePayload());

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    const identity = await verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] });

    expect(identity.sub).toBe("000123.abcdef1234567890.1234");
    expect(identity.email).toBe("private-relay@privaterelay.appleid.com");
    expect(identity.emailVerified).toBe(true);
    expect(identity.isPrivateEmail).toBe(true);
  });

  it("accepts the Services ID audience from the web flow just as readily as the native bundle ID", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(privateKey, KEY_ID, basePayload({ aud: "one.zrp.social.web" }));

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    const identity = await verifyAppleIdentityToken(token, {
      audiences: ["one.zrp.social.web", "one.zrp.social"],
    });
    expect(identity.sub).toBe("000123.abcdef1234567890.1234");
  });

  it("rejects a token whose audience matches neither configured client id", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(privateKey, KEY_ID, basePayload({ aud: "com.someone.else" }));

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    await expect(
      verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] })
    ).rejects.toThrow(/audience/i);
  });

  it("rejects a token from an issuer other than Apple", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(privateKey, KEY_ID, basePayload({ iss: "https://evil.example" }));

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    await expect(
      verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] })
    ).rejects.toThrow(/issuer/i);
  });

  it("rejects an expired token", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(
      privateKey,
      KEY_ID,
      basePayload({ exp: Math.floor(Date.now() / 1000) - 60 })
    );

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    await expect(
      verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] })
    ).rejects.toThrow(/expired/i);
  });

  it("rejects a token signed by a key that isn't in Apple's published JWKS (forged signature)", async () => {
    const { publicKey } = makeKeyPair();
    const { privateKey: attackerKey } = makeKeyPair();
    // The JWKS Apple "publishes" only contains the real key - the attacker
    // signs with a different key entirely but claims the real key's kid.
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const forgedToken = signToken(attackerKey, KEY_ID, basePayload());

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    await expect(
      verifyAppleIdentityToken(forgedToken, { audiences: ["one.zrp.social"] })
    ).rejects.toThrow(/signature/i);
  });

  it("refetches the JWKS once when the token's kid isn't in the cached set (key rotation)", async () => {
    const { publicKey: oldPublicKey } = makeKeyPair();
    const { publicKey: newPublicKey, privateKey: newPrivateKey } = makeKeyPair();

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        // First call (the module's normal cache-miss fetch) only has the
        // old key; the "rotation" refetch has the new one too.
        const keys = call === 1 ? [jwkFor(oldPublicKey, "old-kid")] : [jwkFor(newPublicKey, "new-kid")];
        return { ok: true, json: async () => ({ keys }) };
      })
    );

    const token = signToken(newPrivateKey, "new-kid", basePayload());
    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    const identity = await verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] });
    expect(identity.sub).toBe("000123.abcdef1234567890.1234");
    expect(call).toBe(2);
  });

  it("rejects a nonce that doesn't match the token's hashed nonce claim", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const realNonce = "raw-nonce-value";
    const hashedNonce = crypto.createHash("sha256").update(realNonce).digest("hex");
    const token = signToken(privateKey, KEY_ID, basePayload({ nonce: hashedNonce }));

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    await expect(
      verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"], nonce: "wrong-nonce" })
    ).rejects.toThrow(/nonce/i);

    // The correct raw nonce, hashed the same way Apple hashes it, passes.
    const identity = await verifyAppleIdentityToken(token, {
      audiences: ["one.zrp.social"],
      nonce: realNonce,
    });
    expect(identity.sub).toBe("000123.abcdef1234567890.1234");
  });

  it("skips nonce verification entirely when the caller doesn't supply one", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(privateKey, KEY_ID, basePayload({ nonce: "whatever-apple-put-here" }));

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    const identity = await verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] });
    expect(identity.sub).toBe("000123.abcdef1234567890.1234");
  });

  it("treats real booleans and Apple's stringified booleans for email_verified/is_private_email identically", async () => {
    const { publicKey, privateKey } = makeKeyPair();
    stubAppleKeysEndpoint([jwkFor(publicKey, KEY_ID)]);
    const token = signToken(
      privateKey,
      KEY_ID,
      basePayload({ email_verified: true, is_private_email: false })
    );

    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    const identity = await verifyAppleIdentityToken(token, { audiences: ["one.zrp.social"] });
    expect(identity.emailVerified).toBe(true);
    expect(identity.isPrivateEmail).toBe(false);
  });

  it("rejects a malformed token that isn't three dot-separated segments", async () => {
    const { verifyAppleIdentityToken } = await import("../apple-identity-token");
    await expect(
      verifyAppleIdentityToken("not-a-jwt", { audiences: ["one.zrp.social"] })
    ).rejects.toThrow(/malformed/i);
  });
});
